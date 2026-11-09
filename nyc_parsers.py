"""NYC Parks events calendar (nycgovparks.org/events): no public API. TinyFish Fetch + deterministic parsing.
URL filters used: /events/{category}/f{YYYY-MM-DD}/t{YYYY-MM-DD}/p{page}  (50 events per page)."""
import re
from datetime import datetime

import robots
import tf
from tf import BadInputError, SiteChangedError

BASE = "https://www.nycgovparks.org/events"
BOROUGHS = {"Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"}
_SKIP = re.compile(r"^(all|p\d+|c\d+|f\d{4}.*|t\d{4}.*)$")


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("�", " ").replace("\xa0", " ")).strip()


def _t24(s: str) -> str:
    return datetime.strptime(s.replace(".", "").upper(), "%I:%M %p").strftime("%H:%M")


def _iso(day) -> str:
    day = str(day)
    try:
        return datetime.strptime(day, "%Y-%m-%d").date().isoformat()
    except ValueError as e:
        raise BadInputError(f"date {day!r} must be YYYY-MM-DD") from e


def _times(line: str) -> tuple[str | None, str | None]:
    t = [_t24(x) for x in re.findall(r"\*\*(\d{1,2}:\d{2} [ap]\.m\.)\*\*", line)]
    return (t[0] if t else None), (t[1] if len(t) > 1 else None)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _find_link(links: list[str], pos: int, title: str) -> tuple[str | None, int]:
    """Event detail url for a title: links are in page order and slugged from the title (maybe + trailing digits)."""
    t = _norm(title)
    for i in range(pos, len(links)):
        slug = _norm(links[i].rsplit("/", 1)[1])
        if slug == t or slug.rstrip("0123456789") == t or (len(slug) > 20 and t.startswith(slug)):
            return links[i], i + 1
    return None, pos


def categories(args: dict) -> dict:
    p = tf.fetch_page(BASE, 86400, links=True)
    slugs = []
    for l in p["links"]:
        m = re.fullmatch(re.escape(BASE) + r"/([A-Za-z0-9_-]+)", l)
        if m and not _SKIP.match(m.group(1)) and m.group(1) not in slugs:
            slugs.append(m.group(1))
    if not slugs:
        raise SiteChangedError("nyc parks: no category links found on the events page; layout may have changed")
    return {"categories": [{"slug": s, "name": s.replace("_", " ").replace("-", " ").title()} for s in slugs]}


def list_events(args: dict) -> dict:
    day, cat, page = _iso(args["date"]), args.get("category", "").strip().lower(), int(args.get("page", 1))
    if cat and cat not in [c["slug"].lower() for c in categories({})["categories"]]:
        raise BadInputError(f"unknown category {cat!r}; call list_nyc_parks_event_categories for valid slugs")
    borough = _clean(args.get("borough", "")).title()
    if borough and borough not in BOROUGHS:
        raise BadInputError(f"borough must be one of {sorted(BOROUGHS)}")
    url = f"{BASE}/{cat + '/' if cat else ''}f{day}/t{day}" + (f"/p{page}" if page > 1 else "")
    robots.require(url)
    p = tf.fetch_page(url, 600, links=True)
    text = p["text"]
    total = re.search(r"out of ([\d,]+) events|Currently viewing ([\d,]+) events", text)
    if "No events to view" in text:
        return {"date": day, "category": cat or None, "page": page, "total_on_date": 0, "events": []}
    if not total:
        raise SiteChangedError("nyc parks: 'Currently viewing N events' banner not found; layout may have changed")
    links = list(dict.fromkeys(l for l in p["links"] if re.search(r"/events/\d{4}/\d\d/\d\d/[\w-]+$", l)))
    blocks = re.split(r"(?m)^(?=[A-Z][a-z]{2} ?\d{1,2}\n\n### )", text)[1:]
    if not blocks:
        raise SiteChangedError("nyc parks: the banner says there are events but none could be parsed")
    events, matched, pos = [], 0, 0
    for b in blocks:
        m = re.match(r"[A-Z][a-z]{2} ?\d{1,2}\n\n### ([^\n]+)\n\n#### ([^\n]+)\n\n(.*)", b, re.S)
        if not m:
            raise SiteChangedError("nyc parks: event block no longer matches '### name / #### venue' layout")
        name, where, rest = m.group(1), _clean(m.group(2)), m.group(3)
        where = re.sub(r"^at ", "", where)
        place, _, bor = where.rpartition(",")
        bor = bor.strip()
        if bor not in BOROUGHS:  # some events list a venue with no borough
            place, bor = where, None
        venue, _, park = place.partition(" (in ")
        start, end = _times(rest.splitlines()[0])
        cats = re.search(r"\*\*Category:\*\* (.+)", rest)
        body = []
        for l in rest.splitlines()[1:]:
            if l.startswith(("**Category", "**Free", "Best For")):
                break
            body.append(l)
        desc = _clean(" ".join(body))
        link, pos = _find_link(links, pos, name)
        matched += link is not None
        if borough and bor != borough:
            continue
        events.append({"name": _clean(name), "date": day, "start_time": start, "end_time": end,
                       "venue": venue.strip(), "park": park.rstrip(")").strip() or None, "borough": bor,
                       "description": desc, "categories": [c.strip() for c in cats.group(1).split(",")] if cats else [],
                       "free": "**Free!**" in rest, "url": link})
    if matched * 2 < len(blocks):  # a few events lack a link in the page; over half missing means the layout changed
        raise SiteChangedError(f"nyc parks: only {matched} of {len(blocks)} events could be matched to a detail url")
    return {"date": day, "category": cat or None, "page": page,
            "total_on_date": int((total.group(1) or total.group(2)).replace(",", "")), "events": events}


def get_event(args: dict) -> dict:
    url = args["event_url"].strip()
    robots.require(url)
    t = tf.fetch_text(url, 600)  # unknown event -> NOT_FOUND from Fetch
    h = re.match(r"# ([^\n]+)\n\n\*\*([^\n]+?)\*\*\n\n([^\n]*)\n\n(.*)", t, re.S)
    if not h:
        raise SiteChangedError("nyc parks: event page no longer starts with '# Title / **Date** / **time**'")
    sec = {m.group(1): m.group(2).strip() for m in re.finditer(r"(?ms)^### ([^\n]+)\n\n(.*?)(?=^#{1,3} |\Z)", t)}
    start, end = _times(h.group(3))
    loc = sec.get("Location", "")
    addr = re.search(r"\*\*Location Details:\*\*\s*\n?([^\n]+)", loc)
    lines = [_clean(l.replace("**", "")) for l in loc.splitlines()
             if l.strip() and not l.startswith(("Directions", "**Location Details"))]
    street = addr.group(1).strip() if addr else next((l for l in lines if re.match(r"\d", l)), None)
    try:
        day = datetime.strptime(h.group(2), "%A, %B %d, %Y").date().isoformat()
    except ValueError as e:
        raise SiteChangedError(f"nyc parks: unreadable event date {h.group(2)!r}") from e
    desc = _clean(h.group(4).split("### ")[0])
    return {"name": _clean(h.group(1)), "date": day, "start_time": start, "end_time": end, "description": desc,
            "venue": lines[0] if lines else None, "borough": next((l for l in lines if l in BOROUGHS), None),
            "address": street, "cost": _clean(sec.get("Cost", "")) or None,
            "organizer": _clean(sec.get("Event Organizer", "")) or None,
            "contact_phone": _clean(sec.get("Contact Number", "")) or None,
            "contact_email": _clean(sec.get("Contact Email", "")) or None,
            "categories": [c.strip() for c in sec.get("Categories", "").split(",") if c.strip()]}
