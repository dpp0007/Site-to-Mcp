"""Production smoke test: python smoke_prod.py   (env S2M_URL, S2M_KEY; stdlib only, never prints the key).
Checks health, auth, MCP over HTTP (initialize, tools/list, tools/call), REST, CORS and a real agent tool."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("S2M_URL", "https://site-to-mcp.onrender.com").rstrip("/")
KEY = os.environ.get("S2M_KEY", "")
ORIGIN = os.environ.get("S2M_ORIGIN", "https://web-green-eta-92.vercel.app")
bad = 0


def req(path, body=None, key=KEY, headers=None, method=None, timeout=240):
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", **(headers or {})}
    if key:
        h["Authorization"] = f"Bearer {key}"
    r = urllib.request.Request(URL + path, data=None if body is None else json.dumps(body).encode(), headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as x:
            return x.status, x.read().decode(), dict(x.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers)
    except Exception as e:
        return 0, str(e), {}


def check(name, ok, detail=""):
    global bad
    bad += not ok
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


if not KEY:
    sys.exit("set S2M_KEY first")
t = time.time()
s, b, _ = req("/api/health", key="", timeout=120)
check("health (wakes a sleeping instance)", s == 200 and '"ok"' in b, f"{s} in {time.time() - t:.0f}s")
s, b, _ = req("/api/tools", key="")
check("tool list is public", s == 200 and len(json.loads(b)["tools"]) >= 12, f"{len(json.loads(b)['tools']) if s == 200 else ''} tools")
s, b, _ = req("/api/tools/list_python_events", {}, key="")
check("call without key is rejected", s == 401, str(s))
s, b, _ = req("/api/tools/list_python_events", {}, key="s2m_wrong")
check("call with wrong key is rejected", s == 401, str(s))
s, b, h = req("/api/tools", method="OPTIONS", key="", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
check("CORS allows the website origin", h.get("access-control-allow-origin") == ORIGIN, str(s))
s, b, _ = req("/api/tools/list_python_events", {"limit": 2})
ev = json.loads(b).get("events", []) if s == 200 else []
check("REST fetch tool returns real data", s == 200 and len(ev) > 0, f"{len(ev)} events")
s, b, _ = req("/api/tools/mit_get_course", {"code": "6.1210"})
check("REST MIT course", s == 200 and "6.1210" in b, str(s))
s, b, _ = req("/api/tools/mit_get_course", {"code": "not a code"})
check("bad input gives a clear 400", s == 400 and "BAD_INPUT" in b, str(s))
s, b, _ = req("/api/tools/check_site_access", {"url": "https://luma.com/nyc"})
check("probe: luma.com/nyc", s == 200 and json.loads(b).get("verdict") in ("ALLOWED", "CAUTION"), b[:90] if s != 200 else json.loads(b)["verdict"])

# MCP over streamable HTTP, JSON-RPC
def rpc(method, params=None, i=1):
    s, b, _ = req("/mcp", {"jsonrpc": "2.0", "id": i, "method": method, "params": params or {}})
    if b.startswith("event:"):  # SSE framing
        b = next((l[5:] for l in b.splitlines() if l.startswith("data:")), "{}")
    return s, (json.loads(b) if b.strip().startswith("{") else {})

s, j = rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "smoke", "version": "1"}})
check("MCP initialize", s == 200 and "serverInfo" in j.get("result", {}), j.get("result", {}).get("serverInfo", {}).get("name", str(s)))
s, j = rpc("tools/list", i=2)
names = [t["name"] for t in j.get("result", {}).get("tools", [])]
check("MCP tools/list", len(names) >= 12, f"{len(names)} tools")
s, j = rpc("tools/call", {"name": "list_python_events", "arguments": {"limit": 1}}, i=3)
check("MCP tools/call", s == 200 and not j.get("result", {}).get("isError", True), "ok" if s == 200 else str(s))
s, b, _ = req("/mcp", {"jsonrpc": "2.0", "id": 9, "method": "tools/list"}, key="")
check("MCP without key is rejected", s == 401, str(s))

t = time.time()
s, b, _ = req("/api/tools/list_events_from_page", {"url": "https://luma.com/nyc", "limit": 5})
d = json.loads(b) if s == 200 else {}
check("events from luma.com/nyc (Fetch only, with times)", s == 200 and len(d.get("events", [])) == 5 and d.get("source") == "fetch" and all(e.get("start") for e in d["events"]),
      f"{len(d.get('events', []))} events in {time.time() - t:.0f}s" if s == 200 else b[:150])
print("\nALL PASSED" if not bad else f"\n{bad} FAILED")
sys.exit(1 if bad else 0)
