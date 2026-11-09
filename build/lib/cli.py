"""s2m: use a hosted site-to-mcp from any terminal or script.  Standard library only.

  export S2M_URL=https://your-service.onrender.com   S2M_KEY=s2m_...
  s2m tools                                  list tools + inputs
  s2m access https://luma.com/nyc            may we automate this site?
  s2m events https://luma.com/nyc --limit 5  events listed on a page
  s2m call mit_get_course code=6.1210        any tool: key=value ... (numbers/booleans are parsed)
  s2m call list_nyc_parks_events --json '{"date":"2026-11-14","category":"kids"}'
Output is JSON on stdout; errors go to stderr as `[CODE] message` with a non-zero exit code.
"""
import json
import os
import sys
import urllib.error
import urllib.request


def request(method: str, path: str, body=None):
    base = os.environ.get("S2M_URL", "").rstrip("/")
    if not base.startswith(("http://", "https://")):
        sys.exit("Set S2M_URL to your service address, e.g. https://your-service.onrender.com")
    headers = {"Content-Type": "application/json", "User-Agent": "s2m-cli"}
    if os.environ.get("S2M_KEY"):
        headers["Authorization"] = "Bearer " + os.environ["S2M_KEY"]
    req = urllib.request.Request(base + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)["error"]
            sys.exit(f"[{err['code']}] {err['message']}")
        except (ValueError, KeyError):
            sys.exit(f"[HTTP_{e.code}] {e.reason}")
    except urllib.error.URLError as e:
        sys.exit(f"[UNREACHABLE] {e.reason}")


def coerce(tool: str, k: str, v: str):
    """key=value text -> the type the tool's input schema declares (so code=6.9999 stays a string)."""
    props = next((t["input_schema"].get("properties", {}) for t in request("GET", "/api/tools")["tools"] if t["name"] == tool), {})
    types = {x.get("type") for x in props.get(k, {}).get("anyOf", [props.get(k, {})])}
    if types & {"string"} or not types - {None}:
        return v
    try:
        return json.loads(v)  # integers, booleans, arrays
    except ValueError:
        return v


def main(argv: list[str] | None = None) -> None:
    a = list(sys.argv[1:] if argv is None else argv)
    if not a or a[0] in ("-h", "--help"):
        sys.exit(__doc__)
    cmd, rest = a[0], a[1:]
    limit = None
    if "--limit" in rest:
        i = rest.index("--limit")
        limit = int(rest[i + 1])
        del rest[i:i + 2]
    if cmd == "tools":
        out = request("GET", "/api/tools")
    elif cmd == "access" and rest:
        out = request("POST", "/api/tools/check_site_access", {"url": rest[0]})
    elif cmd == "events" and rest:
        out = request("POST", "/api/tools/list_events_from_page", {"url": rest[0], **({"limit": limit} if limit else {})})
    elif cmd == "call" and rest:
        if "--json" in rest:
            i = rest.index("--json")
            args = json.loads(rest[i + 1])
            del rest[i:i + 2]
        else:
            args = {k: coerce(rest[0], k, v) for k, _, v in (p.partition("=") for p in rest[1:])}
        out = request("POST", f"/api/tools/{rest[0]}", {**args, **({"limit": limit} if limit else {})})
    else:
        sys.exit(__doc__)
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
