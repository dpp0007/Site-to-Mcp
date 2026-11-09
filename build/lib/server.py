"""site-to-mcp server.

  python server.py            stdio  (Claude Desktop / Claude Code / Cursor launch it locally)
  python server.py --http     hosted: MCP at /mcp, REST at /api/*, auth + limits (Render, any Python host)
"""
import functools
import inspect
import os
import sys
from pathlib import Path

import anyio
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

import universal
from specs import load_tools

SITES = os.environ.get("SITES_DIR", str(Path(__file__).parent / "sites"))
HOSTED = "--http" in sys.argv


def _hosts() -> TransportSecuritySettings | None:
    """DNS-rebinding protection for the hosted server: only answer to our own hostname(s)."""
    hosts = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()]
    if not HOSTED or not hosts:
        return None
    return TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=hosts,
                                     allowed_origins=[f"https://{h}" for h in hosts])


mcp = FastMCP("site-to-mcp", stateless_http=True, json_response=True, transport_security=_hosts(),
              instructions="Turns websites with no API into typed tools. Call check_site_access on a new URL first; "
                           "errors start with a [CODE] such as NOT_FOUND, BAD_INPUT, BLOCKED or SITE_CHANGED.")


def offload(f):
    """Tools block (TinyFish calls take seconds to minutes): run each in a worker thread so one slow call
    never stalls the server or other users. Keeps the typed signature MCP builds its schema from."""
    @functools.wraps(f)
    async def run(**kw):
        return await anyio.to_thread.run_sync(functools.partial(f, **kw))
    run.__signature__ = inspect.signature(f)
    return run


for _t in load_tools(SITES):
    mcp.add_tool(offload(_t.as_function()), name=_t.name, description=_t.t["description"])
for _f in (universal.check_site_access, universal.list_events_from_page, universal.extract_from_page):
    mcp.add_tool(offload(_f))


def main() -> None:
    """stdio (default) or `--http` for hosted use."""
    if not HOSTED:
        mcp.run()
        return
    import uvicorn

    from api import build_app
    host, port = os.environ.get("HOST", "0.0.0.0"), int(os.environ.get("PORT", "8000"))
    uvicorn.run(build_app(mcp), host=host, port=port, log_level="info", proxy_headers=True,
                forwarded_allow_ips="*", server_header=False)  # behind Render's proxy: trust X-Forwarded-For


if __name__ == "__main__":
    main()
