"""Deterministic MIT catalog readers + python.org events parser (TinyFish Fetch markdown in, dict out).
Every function raises SiteChangedError if the layout it expects is gone."""
import re
from datetime import date

import tf
from tf import SiteChangedError

BASE = "https://catalog.mit.edu/subjects/"
DAY = 86400  # catalog changes yearly; cache pages for a day


# ---- MIT catalog ----------------------------------------------------------------------------
def departments(args: dict) -> dict:
    p = tf.fetch_page(BASE, DAY, links=True)
    linked = {u.lower() for u in p["links"]}
    items = []
    for m in re.finditer(r"^\* (.+?) \((?:Course )?([\w.]+)\)\s*$", p["text"], re.M):
        code = m.group(2)
        url = f"{BASE}{code.lower()}/"
        if url in linked:
            items.append({"code": code, "name": m.group(1), "url": url})
    if not items:
        raise SiteChangedError("mit departments: no '* Name (Course X)' entries with matching links found")
    return {"items": items}


def subjects(text: str) -> list[dict]:
    """All subjects on one department page."""
    out = []
    for block in re.split(r"(?m)^(?=#### )", text)[1:]:
        head, _, body = block.partition("\n")
        m = re.match(r"#### (\S+) (.+)", head)
        if not m:
            continue
        body = re.split(r"(?m)^#{1,3} ", body)[0].strip()
        paras = body.split("\n\n")
        meta, rest = paras[0].splitlines(), paras[1:]
        prereq = next((l[7:].strip() for l in meta if l.startswith("Prereq:")), None)
        u = re.search(r"([\d-]+) units", " ".join(meta))
        terms = []
        for l in meta:
            t = re.match(r"^[UG] \(([^)]*)\)", l)
            terms += [x.strip() for x in t.group(1).split(",")] if t else []
        instructors = []
        if len(rest) >= 2 and len(rest[-1]) < 160:
            instructors = [x.strip() for x in rest.pop().split(",") if x.strip()]
        out.append({
            "code": m.group(1), "title": m.group(2).strip(), "units": u.group(1) if u else None,
            "description": "\n\n".join(rest).strip(), "prerequisites": prereq,
            "prerequisite_codes": list(dict.fromkeys(re.findall(
                r"\b(?:\d{1,2}[A-Z]?|[A-Z]{2,4})\.[A-Z]?\d{2,4}[A-Z]?(?:\[J\])?", prereq or ""))),
            "instructors": instructors, "terms": list(dict.fromkeys(terms))})
    return out


def _dept_url(dept: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9]{1,5}", dept):
        raise tf.BadInputError(f"department {dept!r} should look like '6', '18', '21M'")
    return f"{BASE}{dept.lower()}/"


def dept_courses(args: dict) -> dict:
    subs = subjects(tf.fetch_text(_dept_url(args["department"]), DAY))
    if not subs:
        raise SiteChangedError("no '#### code title' headings found; page layout may have changed")
    return {"items": [{k: s[k] for k in ("code", "title", "units")} for s in subs]}


def get_course(args: dict) -> dict:
    code = args["code"].strip()
    dept = code.split(".")[0]
    want = code.upper().replace("[J]", "")
    subs = subjects(tf.fetch_text(_dept_url(dept), DAY))
    if not subs:
        raise SiteChangedError(f"mit: no subjects parsed on the page for department {dept!r}; layout may have changed")
    for s in subs:
        if s["code"].upper().replace("[J]", "") == want:
            return {**s, "found": True}
    return {"found": False}


def search(args: dict) -> dict:
    """Keyword search over every subject: all words must appear in code/title/description; title hits rank first."""
    words = re.findall(r"\w+", args["query"].lower())
    if not words:
        raise tf.BadInputError("query is empty")
    if args.get("department"):
        urls = [_dept_url(args["department"])]
    else:
        urls = [d["url"] for d in departments({})["items"]]
    pages = tf.fetch_many(urls, DAY)
    seen, scored = set(), []
    for text in pages.values():
        for s in subjects(text):
            key = s["code"].upper().replace("[J]", "")
            if key in seen:
                continue
            seen.add(key)
            title, hay = s["title"].lower(), f"{s['code']} {s['title']} {s['description']}".lower()
            if all(w in hay for w in words):
                score = sum(3 for w in words if w in title) + (5 if " ".join(words) in title else 0)
                scored.append((-score, len(s["title"]), s["code"], {k: s[k] for k in ("code", "title", "units")}))
    if not seen:
        raise SiteChangedError("mit search: no subjects parsed from any department page; layout may have changed")
    return {"items": [x[3] for x in sorted(scored, key=lambda x: x[:3])]}


# ---- python.org events ------------------------------------------------------------------------
_MON = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}


def python_events(text: str, args: dict) -> dict:
    items = []
    for m in re.finditer(r"^\* ### (.+?)\n(.*?)(?=^\* ### |\Z)", text, re.M | re.S):
        lines = [l.strip() for l in m.group(2).splitlines() if l.strip()]
        dates = re.findall(r"(\d{1,2}) ([A-Za-z]+)\.? (\d{4})", " ".join(lines))
        loc = lines[-1] if lines else ""
        try:
            iso = [date(int(y), _MON[mon[:3].lower()], int(d)).isoformat() for d, mon, y in dates]
        except (KeyError, ValueError) as e:
            raise SiteChangedError(f"python events: unreadable date in {m.group(1)!r}") from e
        if not iso or not re.search(r"[A-Za-z]", loc) or loc.lower().startswith(("–", "more")):
            raise SiteChangedError(f"python events: no date/location found for {m.group(1)!r}")
        items.append({"name": m.group(1).strip(), "start_date": iso[0],
                      "end_date": iso[1] if len(iso) > 1 else None, "location": loc})
    if not items:
        raise SiteChangedError("python events: no '* ### Name' entries found; page layout may have changed")
    return {"events": items}
