"""Can site-to-mcp wrap this site, and does the site allow it?  Run BEFORE writing a spec.

    python probe.py https://example.org/events          # one or more URLs
    python probe.py --spec sites/my_site.yaml           # every tool URL in a spec (placeholders -> health args)
    python probe.py URL --json

Checks: robots.txt rules for automated clients, whether TinyFish Fetch can read the page, bot-walls / login walls /
JS-only shells, terms-of-use text that forbids automation, and whether the site advertises a public API.
Verdict: ALLOWED (exit 0) | CAUTION (exit 2, read the notes) | BLOCKED (exit 1).  Advisory only, not legal advice.
"""
import json
import re
import sys
from urllib.parse import urljoin, urlsplit

import robots
import tf

WALLS = re.compile(r"access denied|captcha|verify you are human|just a moment|attention required|are you a robot|unusual traffic", re.I)
LOGIN = re.compile(r"(sign|log) ?in|password", re.I)
BAN = re.compile(r"[^.\n]*\b(scrap\w*|crawl\w*|spider\w*|robots?|bots?|automated|data[- ]mining|harvest\w*)\b[^.\n]*\b(prohibit\w*|not (?:be )?permitted|may not|must not|forbidden|not allowed|unauthori[sz]ed)\b[^.\n]*"
                 r"|[^.\n]*\b(prohibit\w*|may not|must not|forbidden|not allowed|unauthori[sz]ed)\b[^.\n]*\b(scrap\w*|crawl\w*|spider\w*|robots?|bots?|automated|data[- ]mining|harvest\w*)\b[^.\n]*", re.I)


def _read(url: str):
    try:
        r = tf.client().fetch.get_contents([url], format="markdown", links=True, per_url_timeout_ms=30000)
    except Exception as e:  # slow / throttled / auth: report, don't hang
        return None, f"{type(e).__name__}: {str(e)[:120]}"
    if r.results and r.results[0].text:
        return r.results[0], None
    return None, (str(r.errors[0].error) if r.errors else "empty response")


def probe(url: str) -> dict:
    notes, level = [], 0  # level: 0 allowed, 1 caution, 2 blocked
    ok, why = robots.check(url)
    if not ok:
        level = 2
    page, err = _read(url)
    res = {"url": url, "robots": why, "robots_allowed": ok, "reachable": page is not None, "mode": None}
    if page is None:
        res.update(verdict="BLOCKED", notes=[f"TinyFish Fetch could not read the page: {err}"] + ([why] if not ok else []))
        return res
    text, host = page.text, urlsplit(url).netloc
    res["chars"] = len(text)
    if WALLS.search(text[:3000]) and len(text) < 4000:
        level = 2
        notes.append("page looks like a bot wall / captcha; do not wrap this site")
    if len(text) < 600:
        notes.append("very little static text: if the data you need is not in it, it is JavaScript-rendered -> use `mode: agent`")
        res["mode"] = "agent if the data is missing from a plain Fetch, else fetch"
    elif LOGIN.search(text[:1500]) and len(text) < 3000:
        level = max(level, 1)
        notes.append("looks like a login wall; only wrap public pages")
    else:
        res["mode"] = "fetch (static content readable; write a parser) or agent (if you need to click/search)"
    terms = next((l for l in page.links or [] if re.search(r"/(terms|tos|conditions-of-use|legal|use-policy)", urlsplit(l).path, re.I)), None)
    if terms:
        t, _ = _read(urljoin(url, terms))
        hits = [m.group(0).strip()[:200] for m in BAN.finditer(t.text)] if t else []
        res["terms_url"] = terms
        if hits:
            level = max(level, 1)
            notes.append(f"terms ({terms}) mention restrictions on automation: \"{hits[0]}\"")
        else:
            notes.append(f"terms checked ({terms}): no automation-ban wording found in the text read (advisory)")
    else:
        notes.append("no terms-of-use link found on the page; check the site's policy yourself")
    api = next((l for l in page.links or [] if re.search(r"(^|/|\.)(api|developers?)(\.|/|$)", urlsplit(l).netloc + urlsplit(l).path, re.I)), None)
    if api:
        notes.append(f"site advertises an API/developer area ({api}); prefer it if it covers your need")
    notes.insert(0, why)
    res.update(verdict=["ALLOWED", "CAUTION", "BLOCKED"][level], notes=notes)
    return res


def spec_urls(path: str) -> list[str]:
    """Tool URLs of a spec file (or a directory of specs), placeholders filled from each tool's health args."""
    import pathlib
    import shutil
    import tempfile

    import specs
    p = pathlib.Path(path)
    if p.is_file():  # load_tools wants a directory
        d = tempfile.mkdtemp()
        shutil.copy(p, d)
        p = pathlib.Path(d)
    out = []
    for t in specs.load_tools(p):
        args = {**{k: "x" for k in t.inputs}, **(t.health or {}).get("args", {})}
        out.append(specs._render(t.t["url"], args, url=True))
    return list(dict.fromkeys(out))


def main(argv: list[str]) -> int:
    as_json = "--json" in argv
    argv = [a for a in argv if a != "--json"]
    urls = spec_urls(argv[1]) if argv[:1] == ["--spec"] and len(argv) > 1 else argv
    if not urls:
        print(__doc__)
        return 1
    results = [probe(u) for u in urls]
    if as_json:
        print(json.dumps(results, indent=2))
    else:
        for r in results:
            print(f"{r['verdict']:8} {r['url']}")
            for n in r["notes"]:
                print(f"         - {n}")
            if r.get("mode"):
                print(f"         -> suggested: {r['mode']}")
    verdicts = {r["verdict"] for r in results}
    return 1 if "BLOCKED" in verdicts else 2 if "CAUTION" in verdicts else 0


def main_cli() -> None:
    sys.exit(main(sys.argv[1:]))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
