"""Canary every tool against the live site using its spec's `health:` block (tools run in parallel).
Exit 1 and name the broken tools if a site changed.

    python health_check.py [tool_name ...] [--json]
    python health_check.py --canary          # offline: feed every tool a "redesigned" site, prove each one fails LOUDLY

Health args may use `today` / `today+7`; `args_from` chains a call (e.g. list -> pick a url -> detail).
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import robots
import tf
from specs import check, load_tools

SITES = os.environ.get("SITES_DIR", str(Path(__file__).parent / "sites"))


def expand(args: dict) -> dict:
    def one(v):
        m = re.fullmatch(r"today([+-]\d+)?", v) if isinstance(v, str) else None
        return (date.today() + timedelta(days=int(m.group(1) or 0))).isoformat() if m else v
    return {k: one(v) for k, v in args.items()}


def pick(data, path: str):
    """'events.0.url' walks keys/indexes; '*' means the first item for which the rest of the path is non-null."""
    head, _, rest = path.partition(".")
    if head == "*":
        return next(v for x in data if (v := pick(x, rest) if rest else x) is not None)
    data = data[int(head)] if isinstance(data, list) else data[head]
    return pick(data, rest) if rest else data


def health_args(tool, by_name: dict, offline: bool = False) -> dict:
    h = tool.health
    args = expand(h.get("args", {}))
    if "args_from" in h:
        af = h["args_from"]
        if offline:
            args[af["as"]] = af["example"]
        else:
            data = by_name[af["tool"]].run(**expand(af["args"])).model_dump(mode="json")
            args[af["as"]] = pick(data, af["pick"])
    return args


def check_tool(t, by_name) -> dict:
    t0 = time.time()
    attempts = max(1, int(os.environ.get("HEALTH_RATE_LIMIT_ATTEMPTS", "3")))
    for i in range(attempts):
        try:
            check(t.run(**health_args(t, by_name)).model_dump(mode="json"), t.health.get("expect", []))
            return {"tool": t.name, "ok": True, "seconds": round(time.time() - t0, 1)}
        except Exception as e:
            code = getattr(e, "code", type(e).__name__)
            if code == "RATE_LIMIT" and i < attempts - 1:
                time.sleep(1 + i)
                continue
            return {"tool": t.name, "ok": False, "seconds": round(time.time() - t0, 1),
                    "code": code, "error": str(e)}


def canary(tools) -> list[dict]:
    """Offline. Every page is replaced by junk; a tool that still returns data (or crashes with a non-ToolError) is a silent failure."""
    by_name = {t.name: t for t in tools}
    res = []
    tf.CACHE = False
    orig = (tf._fetch, tf._agent_run, robots.check)
    junk = type("R", (), {"status": "COMPLETED", "result": {"unexpected": "redesign"}, "error": None})()
    tf._fetch = lambda urls, links: {u: {"text": "<html>site redesigned</html>", "links": []} for u in urls}
    tf._agent_run = lambda url, goal, schema: junk
    robots.check = lambda url: (True, "canary")
    try:
        for t in tools:
            if not t.health:
                continue
            try:
                t.run(**health_args(t, by_name, offline=True))
                res.append({"tool": t.name, "ok": False, "error": "returned data from a junk page (SILENT FAILURE)"})
            except tf.ToolError as e:
                res.append({"tool": t.name, "ok": True, "code": e.code})
            except Exception as e:
                res.append({"tool": t.name, "ok": False, "error": f"non-ToolError {type(e).__name__}: {e}"})
    finally:
        tf._fetch, tf._agent_run, robots.check = orig
    return res


def main(argv: list[str]) -> int:
    as_json, is_canary = "--json" in argv, "--canary" in argv
    only = [a for a in argv if not a.startswith("--")]
    tools = load_tools(SITES)
    tf.CACHE = False  # a health check must hit the live site
    if is_canary:
        results = canary(tools)
    else:
        by_name = {t.name: t for t in tools}
        todo = [t for t in tools if (not only or t.name in only) and t.health]
        with ThreadPoolExecutor(max_workers=6) as ex:
            results = list(ex.map(lambda t: check_tool(t, by_name), todo))
    bad = [r for r in results if not r["ok"]]
    if as_json:
        print(json.dumps({"healthy": not bad, "results": results}, indent=2))
    else:
        for r in results:
            if r["ok"]:
                print(f"OK     {r['tool']}" + (f" ({r['seconds']}s)" if "seconds" in r else f" fails loudly [{r['code']}]"))
            else:
                print(f"BROKEN {r['tool']}: {r['error']}")
        print("SITE CHANGED OR TOOL BROKEN" if bad else "all tools healthy")
    return 1 if bad else 0


def main_cli() -> None:
    sys.exit(main(sys.argv[1:]))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
