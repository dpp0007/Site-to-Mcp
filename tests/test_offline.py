"""Offline (CI-safe): fake TinyFish; checks spec -> tool behaviour, parsers, and that failures are LOUD."""
import datetime
import inspect
import pathlib
from urllib.robotparser import RobotFileParser

import pytest

import health_check
import mit_parsers
import nyc_parsers
import probe
import robots
import specs
import tf
import universal

SITES = pathlib.Path(__file__).parent.parent / "sites"
TOOLS = {t.name: t for t in specs.load_tools(SITES)}

DEPT = """# Electrical Engineering (Course 6)

## Algorithms

#### 6.1210 Introduction to Algorithms

Prereq: 6.100A and (6.1200[J] or 18.05)
U (Fall, Spring)
5-0-7 units

Mathematical modeling of computational problems and common algorithms.

E. Demaine, S. Devadas

#### 6.1220[J] Design and Analysis of Algorithms

Same subject as 18.410[J]
Prereq: 6.1210
G (Fall)
4-0-8 units

Advanced algorithm design.

Staff

#### 6.9999 Seminar

Prereq: None
U (Spring)
Units arranged

Reading group about databases.

Consult Department
"""
EVENTS = """## Upcoming Events

* ### PyCon ES 2026

  06 Nov.
  2026
  –
  08 Nov.
  2026
  Barcelona, Spain
* ### XtremePython 2026

  17 Nov.
  2026
  Online
"""
NYC = """# NYC Parks Events Calendar

Currently viewing 2 events

## Monday, November 16, 2026

Nov16

### Interval Walking Sessions

#### at\xa0Athletic Courts (in Torsney Playground),\xa0Queens

**9:00 a.m.**�**10:00 a.m.**
Interval walking.
**Category:** Exercise Classes
**Free!**

Best For
Kids

Nov 16

### Private Studio Class

#### at\xa0MVMNT Fitness Studio

**6:00 p.m.**�**7:00 p.m.**
Paid class.

## Related Information
"""
GOOD_PARK = {"found": True, "park_name": "Zion National Park", "alerts": [], "closures": []}


def fake_agent(monkeypatch, result):
    monkeypatch.setattr(tf, "agent_json", lambda tool, url, goal, schema: result)


def pages(monkeypatch, text, links=()):
    monkeypatch.setattr(tf, "fetch_page", lambda url, ttl=0, links_=False, **k: {"text": text, "links": list(links)})
    monkeypatch.setattr(tf, "fetch_text", lambda url, ttl=0: text)
    monkeypatch.setattr(tf, "fetch_many", lambda urls, ttl=0, **k: {u: text for u in urls})


# ---- specs / typing --------------------------------------------------------------------------
def test_all_specs_load_with_health_blocks():
    assert len(TOOLS) >= 9 and all(t.health for t in TOOLS.values())


def test_signature_is_typed():
    sig = inspect.signature(TOOLS["mit_search_courses"].as_function())
    assert sig.parameters["limit"].default == 10 and sig.parameters["query"].annotation is str


# ---- MIT (fetch + parse) ---------------------------------------------------------------------
def test_mit_get_course_parses_fields(monkeypatch):
    pages(monkeypatch, DEPT)
    c = TOOLS["mit_get_course"].run(code="6.1210")
    assert c.terms == ["Fall", "Spring"] and c.instructors == ["E. Demaine", "S. Devadas"]
    assert c.prerequisite_codes == ["6.100A", "6.1200[J]", "18.05"] and c.units == "5-0-7"


def test_mit_get_course_joint_subject_without_suffix(monkeypatch):
    pages(monkeypatch, DEPT)
    assert TOOLS["mit_get_course"].run(code="6.1220").title.startswith("Design")


def test_mit_unknown_course_is_not_found(monkeypatch):
    pages(monkeypatch, DEPT)
    with pytest.raises(tf.NotFoundError):
        TOOLS["mit_get_course"].run(code="6.0000")


def test_mit_search_ranks_title_first_and_dedupes(monkeypatch):
    monkeypatch.setattr(mit_parsers, "departments", lambda a: {"items": [{"url": "u1"}, {"url": "u2"}]})
    pages(monkeypatch, DEPT)
    out = TOOLS["mit_search_courses"].run(query="algorithms", limit=5)
    assert [i.code for i in out.items] == ["6.1210", "6.1220[J]"]  # same text on two pages -> no duplicates
    assert TOOLS["mit_search_courses"].run(query="databases").items[0].code == "6.9999"  # description match
    assert TOOLS["mit_search_courses"].run(query="zzqxjk").items == []  # a real "no match" is allowed


def test_mit_search_with_unparseable_pages_is_loud(monkeypatch):
    monkeypatch.setattr(mit_parsers, "departments", lambda a: {"items": [{"url": "u1"}]})
    pages(monkeypatch, "<html>redesigned</html>")
    with pytest.raises(tf.SiteChangedError):
        TOOLS["mit_search_courses"].run(query="algorithms")


def test_mit_department_input_validated():
    with pytest.raises(tf.BadInputError):
        TOOLS["mit_list_department_courses"].run(department="../etc")


# ---- python.org events -----------------------------------------------------------------------
def test_python_events_iso_dates(monkeypatch):
    pages(monkeypatch, EVENTS)
    ev = TOOLS["list_python_events"].run(limit=5).events
    assert str(ev[0].start_date) == "2026-11-06" and str(ev[0].end_date) == "2026-11-08" and ev[1].end_date is None
    assert ev[1].location == "Online"


def test_python_events_bad_date_is_loud(monkeypatch):
    pages(monkeypatch, "* ### Thing\n\n  Soon-ish\n  Paris, France\n")
    with pytest.raises(tf.SiteChangedError):
        TOOLS["list_python_events"].run()


# ---- NYC parks -------------------------------------------------------------------------------
def test_nyc_list_events(monkeypatch):
    pages(monkeypatch, NYC, ["https://www.nycgovparks.org/events/2026/11/16/interval-walking-sessions"])
    out = TOOLS["list_nyc_parks_events"].run(date="2026-11-16")
    a, b = out.events
    assert (a.start_time, a.end_time, a.borough, a.park, a.free) == ("09:00", "10:00", "Queens", "Torsney Playground", True)
    assert a.categories == ["Exercise Classes"] and "Kids" not in a.description and a.url.endswith("interval-walking-sessions")
    assert b.borough is None and b.url is None  # private venue, no detail link: still returned
    assert TOOLS["list_nyc_parks_events"].run(date="2026-11-16", borough="Queens").events[0].name.startswith("Interval")


def test_nyc_bad_inputs():
    for bad in ({"date": "2026-02-31"}, {"date": "2026-11-16", "borough": "Gotham"}):
        with pytest.raises(tf.BadInputError):
            TOOLS["list_nyc_parks_events"].run(**bad)


def test_nyc_layout_change_is_loud(monkeypatch):
    pages(monkeypatch, "Currently viewing 3 events\n\nnothing recognisable")
    with pytest.raises(tf.SiteChangedError):
        TOOLS["list_nyc_parks_events"].run(date="2026-11-16")


# ---- agent tool (parks) ----------------------------------------------------------------------
def test_park_ok_and_empty_lists_allowed(monkeypatch):
    pages(monkeypatch, "page")
    fake_agent(monkeypatch, GOOD_PARK)
    assert TOOLS["get_park_conditions"].run(park="ZION").park_name.startswith("Zion")


def test_park_unknown_code_not_found_without_agent_run(monkeypatch):
    def nf(url, ttl=0, links=False):
        raise tf.NotFoundError("page not found")
    monkeypatch.setattr(tf, "fetch_page", nf)
    monkeypatch.setattr(tf, "agent_json", lambda *a: pytest.fail("agent must not run for an unknown park"))
    with pytest.raises(tf.NotFoundError, match=r"\[NOT_FOUND\]"):
        TOOLS["get_park_conditions"].run(park="abcd")


def test_park_empty_name_and_missing_flag_are_loud(monkeypatch):
    pages(monkeypatch, "page")
    fake_agent(monkeypatch, {**GOOD_PARK, "park_name": ""})
    with pytest.raises(tf.NotFoundError):
        TOOLS["get_park_conditions"].run(park="zion")
    fake_agent(monkeypatch, {"park_name": "Zion", "alerts": [], "closures": []})
    with pytest.raises(tf.SiteChangedError):
        TOOLS["get_park_conditions"].run(park="zion")


def test_park_code_pattern():
    with pytest.raises(tf.BadInputError, match=r"\[BAD_INPUT\]"):
        TOOLS["get_park_conditions"].run(park="not-a-code")


def test_agent_wrong_shape_retries_then_raises(monkeypatch):
    pages(monkeypatch, "page")
    calls = []
    monkeypatch.setattr(tf, "agent_json", lambda *a: calls.append(1) or {"nothing": 1})
    with pytest.raises(tf.SiteChangedError):
        TOOLS["get_park_conditions"].run(park="zion")
    assert len(calls) == tf.AGENT_ATTEMPTS == 3


def test_agent_recovers_on_a_later_attempt(monkeypatch):
    pages(monkeypatch, "page")
    outs = iter([{"nothing": 1}, {"nothing": 1}, GOOD_PARK])
    monkeypatch.setattr(tf, "agent_json", lambda *a: next(outs))
    assert TOOLS["get_park_conditions"].run(park="zion").park_name.startswith("Zion")


# ---- cache, robots, errors -------------------------------------------------------------------
def test_agent_result_cached(monkeypatch):
    monkeypatch.setattr(tf, "CACHE", True)
    pages(monkeypatch, "page")
    calls = []
    monkeypatch.setattr(tf, "agent_json", lambda *a: calls.append(1) or GOOD_PARK)
    for _ in range(3):
        TOOLS["get_park_conditions"].run(park="zion")
    assert len(calls) == 1


def test_robots_disallow_blocks_tool(monkeypatch):
    monkeypatch.setattr(robots, "check", lambda url: (False, "robots.txt DISALLOWS /x"))
    with pytest.raises(tf.BlockedError, match=r"\[BLOCKED\]"):
        TOOLS["list_python_events"].run()


def test_robots_rules_are_applied(monkeypatch):
    monkeypatch.undo()  # drop the autouse stub so the real check() runs
    rp = RobotFileParser()
    rp.parse(["User-agent: *", "Disallow: /private/", "Crawl-delay: 3"])
    robots._rp["https://x.test"] = rp
    assert robots.check("https://x.test/public")[0] and not robots.check("https://x.test/private/a")[0]
    assert "crawl-delay 3" in robots.check("https://x.test/public")[1]


def test_health_expectations():
    specs.check({"items": [{"title": "Algorithms"}]}, ["items>=1", "items.title~algo"])
    with pytest.raises(tf.SiteChangedError):
        specs.check({"items": []}, ["items>=1"])


def test_health_helpers():
    assert health_check.expand({"d": "today+0"})["d"] == datetime.date.today().isoformat()
    assert health_check.pick({"events": [{"url": None}, {"url": "u"}]}, "events.*.url") == "u"


def test_health_retries_rate_limit(monkeypatch):
    monkeypatch.setattr(health_check, "check", lambda *_: None)
    monkeypatch.setattr(health_check.time, "sleep", lambda *_: None)
    calls = []

    class _Result:
        def model_dump(self, mode="json"):
            return {"ok": True}

    class _Tool:
        name = "dummy"
        health = {"args": {}}

        def run(self, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                raise tf.ToolError("TinyFish rate limit hit; retry shortly", "RATE_LIMIT")
            return _Result()

    out = health_check.check_tool(_Tool(), {"dummy": _Tool()})
    assert out["ok"] and len(calls) == 2


def test_health_does_not_retry_non_rate_limit(monkeypatch):
    monkeypatch.setattr(health_check, "check", lambda *_: None)
    monkeypatch.setattr(health_check.time, "sleep", lambda *_: None)
    calls = []

    class _Tool:
        name = "dummy"
        health = {"args": {}}

        def run(self, **kwargs):
            calls.append(1)
            raise tf.ToolError("bad auth", "AUTH")

    out = health_check.check_tool(_Tool(), {"dummy": _Tool()})
    assert not out["ok"] and out["code"] == "AUTH" and len(calls) == 1


# ---- the canary: every tool must fail loudly on a redesigned site -----------------------------
def test_canary_every_tool_fails_loudly():
    res = health_check.canary(list(TOOLS.values()))
    assert len(res) == len(TOOLS) and all(r["ok"] for r in res), res


# ---- probe -----------------------------------------------------------------------------------
class _Page:
    def __init__(self, text, links=()):
        self.text, self.links = text, list(links)


def test_probe_verdicts(monkeypatch):
    monkeypatch.setattr(probe, "_read", lambda url: (_Page("x" * 5000), None))
    assert probe.probe("https://ok.test/a")["verdict"] == "ALLOWED"
    monkeypatch.setattr(robots, "check", lambda url: (False, "robots.txt DISALLOWS /a"))
    assert probe.probe("https://ok.test/a")["verdict"] == "BLOCKED"
    monkeypatch.setattr(robots, "check", lambda url: (True, "ok"))
    monkeypatch.setattr(probe, "_read", lambda url: (None, "page_not_found"))
    assert probe.probe("https://ok.test/a")["verdict"] == "BLOCKED"
    monkeypatch.setattr(probe, "_read", lambda url: (_Page("Just a moment... verify you are human"), None))
    assert probe.probe("https://ok.test/a")["verdict"] == "BLOCKED"


def test_probe_flags_terms_that_ban_bots(monkeypatch):
    terms = _Page("You may not use any robot or scraper to access the service.")
    home = _Page("x" * 5000, ["https://ok.test/terms"])
    monkeypatch.setattr(probe, "_read", lambda url: (terms, None) if "terms" in url else (home, None))
    r = probe.probe("https://ok.test/a")
    assert r["verdict"] == "CAUTION" and "automation" in " ".join(r["notes"])


# ---- universal tools (any url) ---------------------------------------------------------------
def test_universal_events_ok_and_limit(monkeypatch):
    ev = {"events": [{"name": "A", "start": "2026-11-12T18:00", "location": "Tribeca", "url": "https://x.test/a"},
                     {"name": "B", "start": "2026-11-13T18:00"}]}
    monkeypatch.setattr(tf, "agent_json", lambda *a: ev)
    out = universal.list_events_from_page("https://luma.com/nyc", limit=1)
    assert [e.name for e in out.events] == ["A"] and out.source_url == "https://luma.com/nyc"


def test_universal_blocked_by_robots(monkeypatch):
    monkeypatch.setattr(robots, "check", lambda url: (False, "robots.txt DISALLOWS /x"))
    monkeypatch.setattr(tf, "agent_json", lambda *a: pytest.fail("must not browse a disallowed url"))
    with pytest.raises(tf.BlockedError):
        universal.list_events_from_page("https://x.test/x")


def test_universal_misplaced_field_and_empty_are_loud(monkeypatch):
    monkeypatch.setattr(tf, "agent_json", lambda *a: {"events": [{"name": "A", "end": "Hudson River Park"}]})
    with pytest.raises(tf.SiteChangedError):
        universal.list_events_from_page("https://x.test/e")
    monkeypatch.setattr(tf, "agent_json", lambda *a: {"events": []})
    with pytest.raises(tf.SiteChangedError):
        universal.list_events_from_page("https://x.test/e")


def test_universal_input_validation():
    for bad in ("ftp://x.test", "http://localhost:8000", "http://192.168.1.5/a", "not a url"):
        with pytest.raises(tf.BadInputError):
            universal.list_events_from_page(bad)
    with pytest.raises(tf.BadInputError):
        universal.extract_from_page("https://x.test", "jobs", ["bad field"])


def test_universal_extract_shapes_records(monkeypatch):
    monkeypatch.setattr(tf, "agent_json", lambda *a: {"items": [{"title": "T", "price": 5, "junk": 1}]})
    out = universal.extract_from_page("https://x.test/list", "products", ["title", "price", "url"])
    assert out.items == [{"title": "T", "price": "5", "url": None}]
