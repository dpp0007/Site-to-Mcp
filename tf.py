"""Thin TinyFish wrapper. Agent = browse/interact + extract; Fetch = cheap static read.
Adds: typed error codes, hard timeouts, a small disk TTL cache, batch fetch."""
import hashlib
import json
import os
import socket
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from pathlib import Path

import httpx
from tinyfish import TinyFish
from tinyfish import APITimeoutError, RequestTimeoutError
from tinyfish._utils.exceptions import AuthenticationError, RateLimitError

AGENT_TIMEOUT = float(os.environ.get("AGENT_TIMEOUT", "240"))  # seconds, hard cap per agent run
CACHE_DIR = Path(os.environ.get("SITE_CACHE_DIR", Path(__file__).parent / ".cache"))
CACHE = os.environ.get("SITE_CACHE", "1") != "0"  # health checks / tests switch this off

_getaddrinfo = socket.getaddrinfo


def _ipv4_first(*a, **k):
    """Try IPv4 addresses before IPv6: on hosts with broken IPv6 every v6 attempt stalls until timeout."""
    return sorted(_getaddrinfo(*a, **k), key=lambda r: r[0] != socket.AF_INET)


socket.getaddrinfo = _ipv4_first


def _load_dotenv() -> None:
    """KEY=value lines from ./.env fill missing env vars (so `python server.py` works without exporting)."""
    try:
        for line in (Path(__file__).parent / ".env").read_text("utf-8-sig").splitlines():
            k, sep, v = line.strip().removeprefix("export ").partition("=")
            if sep and not k.startswith("#"):
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    except OSError:
        pass


_load_dotenv()
_client: TinyFish | None = None


class ToolError(RuntimeError):
    """Base: surfaces to the MCP client as a tool error, always prefixed with a machine-readable [CODE]."""
    code = "TOOL_ERROR"

    def __init__(self, msg: str, code: str | None = None):
        self.code = code or self.code
        super().__init__(f"[{self.code}] {msg}")


class SiteChangedError(ToolError):
    """The site no longer looks the way this tool expects."""
    code = "SITE_CHANGED"


class NotFoundError(ToolError):
    code = "NOT_FOUND"


class BadInputError(ToolError):
    code = "BAD_INPUT"


class BlockedError(ToolError):
    """The site's robots.txt (or the site itself) does not allow automated access."""
    code = "BLOCKED"


def client() -> TinyFish:
    global _client
    _client = _client or TinyFish(timeout=httpx.Timeout(AGENT_TIMEOUT, connect=10.0), max_retries=2)  # fail fast on a dead connect
    return _client


def _path(key: str) -> Path:
    return CACHE_DIR / (hashlib.sha256(key.encode()).hexdigest()[:32] + ".json")


def _get(key: str, ttl: float):
    if not CACHE or ttl <= 0:
        return None
    try:
        d = json.loads(_path(key).read_text("utf-8"))
        return d["v"] if time.time() - d["t"] < ttl else None
    except (OSError, ValueError, KeyError):
        return None


def _put(key: str, v) -> None:
    if not CACHE:
        return
    try:
        CACHE_DIR.mkdir(exist_ok=True)
        _path(key).write_text(json.dumps({"t": time.time(), "v": v}), "utf-8")
    except OSError:
        pass  # cache is best-effort


def cached(key: str, ttl: float, fn):
    """JSON-serialisable result of fn(), reused for ttl seconds. Only successes are cached."""
    v = _get(key, ttl)
    if v is None:
        v = fn()
        _put(key, v)
    return v


def _agent_run(url: str, goal: str, schema: dict):
    ex = ThreadPoolExecutor(max_workers=1)
    fut = ex.submit(lambda: client().agent.run(url=url, goal=goal, output_schema=schema))
    try:
        return fut.result(timeout=AGENT_TIMEOUT)
    except FutTimeout as e:
        raise ToolError(f"TinyFish agent timed out after {AGENT_TIMEOUT:.0f}s on {url}", "TIMEOUT") from e
    finally:
        ex.shutdown(wait=False)


def agent_json(tool: str, url: str, goal: str, schema: dict) -> dict:
    try:
        r = _agent_run(url, goal, schema)
    except AuthenticationError as e:
        raise ToolError("TinyFish API key invalid/missing (set TINYFISH_API_KEY)", "AUTH") from e
    except RateLimitError as e:
        raise ToolError("TinyFish rate limit hit; retry shortly", "RATE_LIMIT") from e
    except (APITimeoutError, RequestTimeoutError) as e:
        raise ToolError(f"TinyFish agent timed out on {url}", "TIMEOUT") from e
    if r.status != "COMPLETED" or r.result is None:
        msg = getattr(r.error, "message", r.status)
        raise SiteChangedError(f"{tool}: TinyFish agent failed on {url}: {msg}")
    res = r.result
    if isinstance(res, str):
        try:
            res = json.loads(res)
        except ValueError as e:
            raise SiteChangedError(f"{tool}: agent returned non-JSON from {url}") from e
    if not isinstance(res, dict):
        raise SiteChangedError(f"{tool}: unexpected result shape from {url}")
    return res


def _fetch(urls: list[str], links: bool) -> dict[str, dict]:
    try:
        r = client().fetch.get_contents(urls, format="markdown", links=links)
    except AuthenticationError as e:
        raise ToolError("TinyFish API key invalid/missing (set TINYFISH_API_KEY)", "AUTH") from e
    except RateLimitError as e:
        raise ToolError("TinyFish rate limit hit; retry shortly", "RATE_LIMIT") from e
    out = {x.url: {"text": x.text, "links": list(x.links or [])} for x in r.results if x.text}
    for e in r.errors or []:
        if "not_found" in str(e.error) or "404" in str(e.error):
            raise NotFoundError(f"page not found: {e.url}")
    return out


def fetch_page(url: str, ttl: float = 0, links: bool = False) -> dict:
    """{'text','links'} for one URL (TinyFish Fetch, no credits). Cached for ttl seconds."""
    def go():
        got = _fetch([url], links)
        if not got:
            raise SiteChangedError(f"fetch returned nothing for {url}")
        return next(iter(got.values()))
    return cached(f"fetch|{url}|{links}", ttl, go)


def fetch_text(url: str, ttl: float = 0) -> str:
    return fetch_page(url, ttl)["text"]


def fetch_many(urls: list[str], ttl: float = 86400, batch: int = 8) -> dict[str, str]:
    """Texts for many URLs, batched in parallel. Raises SiteChangedError if any page is missing (no silent partials)."""
    urls = list(dict.fromkeys(urls))
    texts = {u: v["text"] for u in urls if (v := _get(f"fetch|{u}|False", ttl))}
    todo = [u for u in urls if u not in texts]
    chunks = [todo[i:i + batch] for i in range(0, len(todo), batch)]
    with ThreadPoolExecutor(max_workers=6) as ex:
        for got in ex.map(lambda c: _fetch(c, False), chunks):
            for u, v in got.items():
                texts[u] = v["text"]
                _put(f"fetch|{u}|False", {"text": v["text"], "links": []})
    missing = [u for u in urls if u not in texts]
    if missing:
        raise SiteChangedError(f"{len(missing)} of {len(urls)} pages could not be read, e.g. {missing[0]}")
    return texts
