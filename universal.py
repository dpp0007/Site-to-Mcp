"""Universal tools: paste ANY url, no spec needed.  Access is checked first (robots.txt, bot walls, terms), then
TinyFish does the work.  Same loud-failure rules as the spec tools."""
import ipaddress
import json
import re
from urllib.parse import urlsplit

from pydantic import BaseModel

import probe
import robots
import tf
from tf import BadInputError, BlockedError, SiteChangedError

TTL = 600


class SiteAccess(BaseModel):
    url: str
    verdict: str  # ALLOWED | CAUTION | BLOCKED
    robots_allowed: bool
    reachable: bool
    notes: list[str]
    suggested_mode: str | None = None


class PageEvent(BaseModel):
    name: str
    start: str | None = None   # ISO 8601 when the page shows a date, else as displayed
    end: str | None = None
    location: str | None = None
    url: str | None = None     # link to the event's own page
    host: str | None = None


class PageEvents(BaseModel):
    source_url: str
    events: list[PageEvent]
    source: str = "agent"         # "fetch" (fast, repeatable) or "agent" (browser agent)
    warnings: list[str] = []      # anything the caller must know, e.g. times were not read


class Extracted(BaseModel):
    source_url: str
    items: list[dict[str, str | None]]


def _check_url(url: str) -> str:
    u = urlsplit(url.strip())
    host = u.hostname or ""
    if u.scheme not in ("http", "https") or not host or host == "localhost" or host.endswith((".local", ".internal")):
        raise BadInputError(f"{url!r} must be a public http(s) URL")
    try:
        if not ipaddress.ip_address(host).is_global:
            raise BadInputError(f"{url!r} is a private address")
    except ValueError:
        pass  # a hostname, fine
    return u.geturl()


def _agent(tool: str, url: str, goal: str, schema: dict, validate=lambda d: None) -> dict:
    robots.require(url)  # the site must allow automated access to this exact URL

    def once():
        d = tf.agent_json(tool, url, goal, schema)
        validate(d)
        return d

    return tf.cached(f"{tool}|{url}|{goal}", TTL, lambda: tf.with_retries(once))  # retries, then fails loudly


def _events_ok(d: dict) -> None:
    """Catch the classic agent slip: a venue/organiser landing in a date field."""
    for e in d.get("events") or []:
        for f in ("start", "end"):
            if e.get(f) and not re.search(r"\d", e[f]):
                raise SiteChangedError(f"list_events_from_page: {f}={e[f]!r} for {e.get('name')!r} is not a date/time")


LUMA_HOSTS = {"luma.com", "www.luma.com", "lu.ma"}
_RESERVED = {"discover", "signin", "calendar", "explore", "create", "map", "events", "home", "about", "pricing", "help"}
_NOISE = re.compile(r"\+\d+|Waitlist|Sold Out|Free|Register|Past Event", re.I)


def _norm(x: str) -> str:
    return re.sub(r"\W+", " ", x or "").strip().lower()


def _luma_cards(md: str) -> list[dict]:
    """Event cards from a Luma city/calendar page's text: '### Name', then 'By host', then the venue."""
    body = md.split("## Events", 1)[-1]
    cards = []
    for block in re.split(r"^### ", body, flags=re.M)[1:]:
        name, *rest = [ln.strip() for ln in block.split("\n")]
        lines = [ln for ln in rest if ln and not _NOISE.fullmatch(ln)]
        host = next((ln for ln in lines if ln.startswith("By ")), None)
        venue = next((ln for ln in lines if ln != host and not ln.startswith("## ")), None)
        if name:
            cards.append({"name": name, "host": host, "location": venue})
    return cards


def _json_ld_event(html: str) -> dict | None:
    """The schema.org Event object in a page's <script type="application/ld+json"> blocks, if any."""
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        for x in (d if isinstance(d, list) else [d]):
            if isinstance(x, dict) and "Event" in str(x.get("@type")) and x.get("name"):
                return x
    return None


def _iso(v: str | None) -> str | None:
    """'2026-11-10T07:00:00.000-05:00' -> '2026-11-10T07:00:00-05:00' (ISO 8601 with the event's own UTC offset)."""
    return re.sub(r"\.\d+(?=(Z|[+-]\d\d:\d\d)$)", "", v) if v else None


def _luma_events(url: str, limit: int) -> PageEvents:
    """Fast, repeatable path for Luma pages, TinyFish Fetch only (no browser agent): the city page gives names, hosts
    and venues; each event's own page carries schema.org JSON-LD with exact start/end times. Every link is matched by
    the event's title, so a name is never paired with the wrong URL or time."""
    page = tf.fetch_page(url, TTL, links=True)
    cards = _luma_cards(page["text"])[:limit]
    own = urlsplit(url).path.strip("/").lower()
    cands: list[str] = []
    for ln in page["links"]:
        u = urlsplit(ln)
        slug = u.path.strip("/")
        if (u.hostname in LUMA_HOSTS and re.fullmatch(r"[A-Za-z0-9_-]+", slug) and slug.lower() not in _RESERVED | {own}
                and not u.fragment and not u.query and ln not in cands):
            cands.append(ln)
    if not cards or not cands:
        raise SiteChangedError(f"list_events_from_page: no event cards/links found at {url}; the page layout may have changed")
    by_title = {}
    for link, html in tf.fetch_html_many(cands[:limit + 8], TTL).items():
        ev = _json_ld_event(html)
        og = re.search(r'<meta content="([^"]+?)(?: [··�|] Luma)?" property="og:title"', html)
        title = (ev or {}).get("name") or (og.group(1) if og else None)
        if title:
            by_title[_norm(title)] = (link, ev or {})
    events, undated = [], 0
    for c in cards:
        hit = by_title.get(_norm(c["name"]))
        if not hit:
            raise SiteChangedError(f"list_events_from_page: could not match {c['name']!r} to an event page at {url}")
        link, ev = hit
        start, end = _iso(ev.get("startDate")), _iso(ev.get("endDate"))
        undated += start is None
        events.append(PageEvent(name=c["name"], start=start, end=end, location=c["location"], url=link,
                                host=(c["host"] or "").removeprefix("By ") or None))
    warn = [f"{undated} of {len(events)} events had no start time on their page"] if undated else []
    return PageEvents(source_url=url, source="fetch", events=events, warnings=warn)


def check_site_access(url: str) -> SiteAccess:
    """Before using any tool on a new site: does the site allow automated access to this URL (robots.txt), can
    TinyFish read it, is it behind a bot wall / login, do its terms ban scraping? Verdict ALLOWED, CAUTION or BLOCKED."""
    r = probe.probe(_check_url(url))
    return SiteAccess(url=url, verdict=r["verdict"], robots_allowed=r["robots_allowed"], reachable=r["reachable"],
                      notes=r["notes"], suggested_mode=r.get("mode"))


def list_events_from_page(url: str, limit: int = 20, with_dates: bool = False) -> PageEvents:
    """Events listed on ANY event-listing page, e.g. a Luma city page (https://luma.com/nyc), a meetup/venue calendar.
    Checks robots.txt first (BLOCKED if disallowed). Returns typed events, never page text. Luma pages are read with
    TinyFish Fetch only (fast, repeatable): name, start/end time with UTC offset, venue, host and link. Other sites use
    the browser agent (slower). `with_dates` is kept for older clients and has no effect: times are always included
    where the page provides them."""
    url = _check_url(url)
    limit = max(1, min(int(limit), 100))
    if urlsplit(url).hostname in LUMA_HOSTS:
        robots.require(url)
        return tf.with_retries(lambda: _luma_events(url, limit))
    goal = (f"This page lists events. They load after the page opens: wait until event cards are visible (do not answer before that, and never answer with an empty list unless the page clearly shows no events), then scroll down to load more and collect up to {limit} events that are actually shown. "
            "For each give: name; start (ISO 8601 like 2026-11-14T18:30 if a date/time is shown, otherwise exactly as "
            "displayed); end (a DATE/TIME only; null unless an explicit end time is shown, cards usually show none); "
            "location (the venue or neighbourhood/city text on the card, 'Online' if virtual, null if not shown; this is "
            "NOT the organiser); url (absolute link to that event's own page); host (the organiser, e.g. 'By X'; null if "
            "not shown). "
            "Return JSON {events:[...]}. Do not invent events; return an empty list if the page has none.")
    schema = {"type": "object", "required": ["events"], "properties": {"events": {"type": "array", "items": {
        "type": "object", "required": ["name"], "properties": {k: {"type": "string"} for k in
                                                                ("name", "start", "end", "location", "url", "host")}}}}}
    data = _agent("list_events_from_page", url, goal, schema, _events_ok)
    try:
        out = PageEvents(source_url=url, events=data["events"][:limit])
    except (KeyError, TypeError, ValueError) as e:
        raise SiteChangedError(f"list_events_from_page: result no longer matches expected shape at {url}") from e
    if not out.events or any(not e.name.strip() for e in out.events):
        raise SiteChangedError(f"list_events_from_page: no events found at {url}; it may not be an event listing, "
                               "or the page changed. Run check_site_access first.")
    return out


def extract_from_page(url: str, instruction: str, fields: list[str], limit: int = 20) -> Extracted:
    """Pull a list of records from ANY public page. `instruction` says what to collect (e.g. 'job listings'),
    `fields` names the columns (e.g. ['title','company','location','url']). Checks robots.txt first."""
    url = _check_url(url)
    fields = [f.strip() for f in fields if f.strip()]
    if not fields or len(fields) > 12 or any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,40}", f) for f in fields):
        raise BadInputError("fields must be 1-12 simple column names like ['title', 'price']")
    if len(instruction.strip()) < 3:
        raise BadInputError("instruction must say what to collect")
    limit = max(1, min(int(limit), 100))
    goal = (f"Collect up to {limit} of: {instruction.strip()}. For each record return exactly these string fields: "
            f"{', '.join(fields)} (null if not shown; links as absolute urls). Return JSON {{items:[...]}}. "
            "Only records actually shown on the page; return an empty list if there are none.")
    schema = {"type": "object", "required": ["items"], "properties": {"items": {"type": "array", "items": {
        "type": "object", "properties": {f: {"type": "string"} for f in fields}}}}}
    data = _agent("extract_from_page", url, goal, schema)
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise SiteChangedError(f"extract_from_page: nothing found at {url} for {instruction!r}; page may be empty, "
                               "JS-gated or changed. Run check_site_access first.")
    try:
        return Extracted(source_url=url, items=[{f: (str(i.get(f)) if i.get(f) is not None else None) for f in fields}
                                                for i in items[:limit]])
    except AttributeError as e:
        raise SiteChangedError(f"extract_from_page: unexpected record shape at {url}") from e
