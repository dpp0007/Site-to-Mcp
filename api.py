"""Hosted surface: security middleware + REST API around the MCP app.  Everything secret stays server side:
the TinyFish key lives only in the server's environment and never reaches a client.

Public:   GET /api/health   GET /api/tools          (IP rate-limited, no key)
Keyed:    POST /mcp (MCP over HTTP)   POST /api/tools/{name} (REST for curl / the CLI)
          Authorization: Bearer <key>.  Keys are stored as sha256 hashes in API_KEYS="name:hash,name2:hash2".
"""
import hashlib
import hmac
import json
import logging
import os
import re
import time
from collections import defaultdict, deque

from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

log = logging.getLogger("s2m")
MAX_BODY = 64 * 1024                      # tool calls are tiny; reject anything bigger
PER_MINUTE = int(os.environ.get("RATE_PER_MINUTE", "30"))     # per key
PER_DAY = int(os.environ.get("RATE_PER_DAY", "300"))          # per key: caps TinyFish spend
PUBLIC_PER_MINUTE = int(os.environ.get("PUBLIC_PER_MINUTE", "60"))  # per IP on public endpoints
STATUS = {"BAD_INPUT": 400, "NOT_FOUND": 404, "BLOCKED": 403, "RATE_LIMIT": 429, "TIMEOUT": 504,
          "SITE_CHANGED": 502, "AUTH": 502}
HEADERS = {
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store", "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


def load_keys() -> dict[str, str]:
    """{sha256 hash: key name} from API_KEYS. Raises if hosted with no keys (unless ALLOW_ANON=1 for local dev)."""
    out = {}
    for item in os.environ.get("API_KEYS", "").split(","):
        name, _, h = item.strip().partition(":")
        if name and re.fullmatch(r"[0-9a-f]{64}", h):
            out[h] = name
    if not out and not os.environ.get("KEY_SECRET") and os.environ.get("ALLOW_ANON") != "1":
        raise RuntimeError("API_KEYS is empty: refusing to serve the hosted API unauthenticated. "
                           "Create a key with `python keys.py new <name>` (or set ALLOW_ANON=1 for local dev).")
    return out


SECRET = os.environ.get("KEY_SECRET", "").encode()          # signs self-serve keys; unset = signup disabled
KEY_DAYS = int(os.environ.get("KEY_DAYS", "30"))             # self-serve key lifetime
SIGNUP_PER_DAY = int(os.environ.get("SIGNUP_PER_DAY", "3"))  # keys one IP may mint per day
USER_PER_MINUTE = int(os.environ.get("USER_PER_MINUTE", "10"))
USER_PER_DAY = int(os.environ.get("USER_PER_DAY", "60"))     # per self-serve key
IP_PER_DAY = int(os.environ.get("IP_PER_DAY", "100"))        # per IP across all its keys: minting more keys doesn't help
GLOBAL_PER_DAY = int(os.environ.get("GLOBAL_PER_DAY", "1000"))  # all self-serve calls together: caps TinyFish spend
REVOKED = {x.strip() for x in os.environ.get("REVOKED_KEYS", "").split(",") if x.strip()}


def _sig(body: str) -> str:
    return hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]


def mint_key() -> tuple[str, int]:
    """Stateless key: s2m_u.<expiry>.<id>.<sig>. Nothing is stored; the server just re-checks the signature."""
    import secrets
    exp, kid = int(time.time()) + KEY_DAYS * 86400, secrets.token_hex(6)
    return f"s2m_u.{exp}.{kid}.{_sig(f'{exp}.{kid}')}", exp


def verify_key(tok: str) -> str | None:
    """Return 'u:<id>' for a valid, unexpired, unrevoked self-serve key."""
    p = tok.split(".")
    if not SECRET or len(p) != 4 or p[0] != "s2m_u" or not p[1].isdigit():
        return None
    if not hmac.compare_digest(p[3], _sig(f"{p[1]}.{p[2]}")) or int(p[1]) < time.time() or p[2] in REVOKED:
        return None
    return f"u:{p[2]}"


TRUST_HOPS = int(os.environ.get("TRUST_PROXY_HOPS", "1"))   # proxies in front of us that append to X-Forwarded-For (Render: 1)


def client_ip(scope) -> str:
    """The caller's IP. X-Forwarded-For is client-controlled on the left; only entries our own proxies appended
    (the right-hand TRUST_HOPS) can be trusted, so take the entry that many places from the right."""
    for k, v in scope.get("headers", []):
        if k == b"x-forwarded-for":
            parts = [x.strip() for x in v.decode("latin-1").split(",") if x.strip()]
            if len(parts) >= TRUST_HOPS > 0:
                return parts[-TRUST_HOPS]
    return (scope.get("client") or ("?",))[0]


class Window:
    """Sliding-window counter: allow(key, limit, seconds)."""
    def __init__(self):
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, limit: int, seconds: float) -> bool:
        now, q = time.monotonic(), self.hits[key]
        while q and now - q[0] > seconds:
            q.popleft()
        if len(self.hits) > 20000:  # bound memory: drop keys whose hits are all older than a day
            for k in [k for k, d in self.hits.items() if not d or now - d[-1] > 86400]:
                del self.hits[k]
        if len(q) >= limit:
            return False
        q.append(now)
        return True


class _TooBig(BaseException):  # BaseException so handlers that catch Exception cannot swallow it
    pass


class Guard:
    """Pure-ASGI middleware (safe for streaming): security headers, body cap, auth, rate limits, access log."""

    def __init__(self, app, keys: dict[str, str]):
        self.app, self.keys, self.win = app, keys, Window()

    @staticmethod
    def _json(status: int, code: str, msg: str, extra=None):
        return JSONResponse({"error": {"code": code, "message": msg}}, status_code=status, headers={**HEADERS, **(extra or {})})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        m = re.fullmatch(r"/mcp/(s2m_u\.[A-Za-z0-9._-]+)/?", scope["path"])
        if m:  # key in the URL path (clients that drop query strings): move it out of the path before anything logs it
            scope = {**scope, "path": "/mcp", "raw_path": b"/mcp", "path_key": m.group(1)}
        scope = {**scope, "client_ip": client_ip(scope)}
        req = Request(scope)
        path, ip = scope["path"], scope["client_ip"]
        how = ("header" if req.headers.get("authorization") else "path" if scope.get("path_key")
               else "query" if req.query_params.get("key") else "none")
        keyed = path.startswith("/mcp") or (path.startswith("/api/tools/") and req.method == "POST")
        t0, who = time.monotonic(), "anon"
        resp = None
        if req.method == "OPTIONS":
            pass  # CORS preflight carries no secrets; CORSMiddleware answers it
        elif int(req.headers.get("content-length") or 0) > MAX_BODY:
            resp = self._json(413, "BAD_INPUT", "request body too large")
        elif keyed:
            who = self._who(req)
            if who is None:
                resp = self._json(401, "UNAUTHORIZED", "missing or invalid API key", {"WWW-Authenticate": "Bearer"})
            elif who.startswith("u:"):  # self-serve key: tighter per-key limits plus per-IP and global caps
                if (not self.win.allow(f"m:{who}", USER_PER_MINUTE, 60) or not self.win.allow(f"d:{who}", USER_PER_DAY, 86400)
                        or not self.win.allow(f"ipd:{ip}", IP_PER_DAY, 86400) or not self.win.allow("global", GLOBAL_PER_DAY, 86400)):
                    resp = self._json(429, "RATE_LIMIT", "rate limit exceeded for this key", {"Retry-After": "60"})
            elif not self.win.allow(f"m:{who}", PER_MINUTE, 60) or not self.win.allow(f"d:{who}", PER_DAY, 86400):
                resp = self._json(429, "RATE_LIMIT", "rate limit exceeded for this key", {"Retry-After": "60"})
        elif not self.win.allow(f"ip:{ip}", PUBLIC_PER_MINUTE, 60):
            resp = self._json(429, "RATE_LIMIT", "too many requests", {"Retry-After": "60"})
        status, got, started = 0, 0, False

        async def recv():  # Content-Length can be absent (chunked): count what actually arrives
            nonlocal got
            msg = await receive()
            if msg["type"] == "http.request":
                got += len(msg.get("body", b""))
                if got > MAX_BODY:
                    raise _TooBig
            return msg

        async def send_h(msg):
            nonlocal status, started
            if msg["type"] == "http.response.start":
                status, started = msg["status"], True
                msg["headers"] = [*msg.get("headers", []), *[(k.lower().encode(), v.encode()) for k, v in HEADERS.items()
                                                             if k.lower().encode() not in {h[0] for h in msg.get("headers", [])}]]
            await send(msg)
        try:
            if resp is not None:
                await resp(scope, receive, send_h)
            else:
                await self.app(scope, recv, send_h)
        except _TooBig:
            if not started:
                await self._json(413, "BAD_INPUT", "request body too large")(scope, receive, send_h)
        finally:  # log who/what/how long only: never bodies, arguments or keys
            log.info("%s %s key=%s auth=%s status=%s ms=%d", req.method, re.sub(r"s2m_u\.[\w.-]+", "s2m_u.***", path), who, how, status, (time.monotonic() - t0) * 1000)

    def _who(self, req: Request) -> str | None:
        if not self.keys and not SECRET:  # ALLOW_ANON local dev
            return "dev"
        auth = req.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            tok = auth[7:].strip()
        elif (pk := req.scope.get("path_key", "")).startswith("s2m_u."):
            tok = pk
        elif req.url.path.startswith("/mcp") and (q := req.query_params.get("key", "")).startswith("s2m_u."):
            tok = q  # for clients that cannot send headers (ChatGPT's connector): generated keys only, /mcp only
        else:
            return None
        if tok.startswith("s2m_u."):
            return verify_key(tok)
        digest = hashlib.sha256(tok.encode()).hexdigest()
        for h, name in self.keys.items():  # constant-time compare against every stored hash
            if hmac.compare_digest(h, digest):
                return name
        return None


def build_app(mcp):
    app = mcp.streamable_http_app()

    async def health(_):
        return JSONResponse({"status": "ok", "tools": len(await mcp.list_tools()), "version": "0.2.0"})

    async def tools(_):
        return JSONResponse({"tools": [{"name": t.name, "description": t.description, "input_schema": t.inputSchema}
                                       for t in await mcp.list_tools()]})

    async def call(request: Request):
        name = request.path_params["name"]
        try:
            args = await request.json()
            assert isinstance(args, dict)
        except Exception:
            return Guard._json(400, "BAD_INPUT", "body must be a JSON object of tool arguments")
        if name not in {t.name for t in await mcp.list_tools()}:
            return Guard._json(404, "NOT_FOUND", f"unknown tool {name!r}; GET /api/tools lists them")
        try:
            res = await mcp.call_tool(name, args)
        except Exception as e:  # tool errors carry a leading [CODE]
            m = re.search(r"\[([A-Z_]+)\]\s*(.*)", str(e), re.S)
            code, msg = (m.group(1), m.group(2)) if m else ("TOOL_ERROR", str(e))
            return Guard._json(STATUS.get(code, 400 if code == "TOOL_ERROR" else 500), code, msg[:500])
        structured = res[1] if isinstance(res, tuple) else res if isinstance(res, dict) else None
        if structured is None:
            text = "".join(getattr(c, "text", "") for c in (res[0] if isinstance(res, tuple) else res))
            try:
                structured = json.loads(text)
            except ValueError:
                structured = {"text": text}
        return JSONResponse(structured)

    async def openapi(request: Request):
        """OpenAPI 3.1 for ChatGPT custom GPT Actions (API-key auth) and any REST/OpenAPI client."""
        base = os.environ.get("PUBLIC_URL") or str(request.base_url).rstrip("/")
        paths = {f"/api/tools/{t.name}": {"post": {
            "operationId": t.name, "summary": (t.description or t.name)[:290],
            "requestBody": {"required": True, "content": {"application/json": {"schema": t.inputSchema}}},
            "responses": {"200": {"description": "Typed JSON result", "content": {"application/json": {"schema": {"type": "object"}}}},
                          "default": {"description": "Error: {error: {code, message}}"}}}}
            for t in await mcp.list_tools()}
        return JSONResponse({"openapi": "3.1.0", "info": {"title": "site-to-mcp", "version": "0.2.0",
                                                          "description": "Typed tools for websites with no API."},
                             "servers": [{"url": base}], "paths": paths,
                             "components": {"securitySchemes": {"bearer": {"type": "http", "scheme": "bearer"}}},
                             "security": [{"bearer": []}]})

    async def signup(request: Request):
        """Self-serve key. Shown once, expires, tightly rate-limited. Needs KEY_SECRET on the server."""
        if not SECRET:
            return Guard._json(404, "NOT_FOUND", "self-serve keys are not enabled on this server")
        ip = request.scope.get("client_ip", "?")
        if not signup_win.allow(f"su:{ip}", SIGNUP_PER_DAY, 86400):
            return Guard._json(429, "RATE_LIMIT", f"at most {SIGNUP_PER_DAY} keys per day per network", {"Retry-After": "3600"})
        key, exp = mint_key()
        return JSONResponse({"key": key, "expires_at": exp, "days": KEY_DAYS,
                             "limits": {"per_minute": USER_PER_MINUTE, "per_day": USER_PER_DAY}})

    signup_win = Window()
    app.add_route("/api/keys", signup, methods=["POST"])
    app.add_route("/api/openapi.json", openapi, methods=["GET"])
    app.add_route("/api/health", health, methods=["GET"])
    app.add_route("/api/tools", tools, methods=["GET"])
    app.add_route("/api/tools/{name}", call, methods=["POST"])
    origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "OPTIONS"],
                       allow_headers=["Authorization", "Content-Type", "Mcp-Session-Id"], max_age=600)
    app.add_middleware(Guard, keys=load_keys())  # outermost: runs before everything else
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    return app
