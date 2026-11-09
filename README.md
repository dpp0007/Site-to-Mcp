# site-to-mcp

Turn websites with **no API** into typed MCP tools for your agent. Describe a site in a small YAML file (plus an optional parser); the server registers each entry as a real MCP tool with typed inputs and a typed output, and [TinyFish](https://docs.tinyfish.ai) does the reading and clicking underneath.

**Install in 60 seconds**
```bash
pip install -e .
export TINYFISH_API_KEY=...            # https://agent.tinyfish.ai/api-keys   (or put it in .env)
claude mcp add site-to-mcp -e TINYFISH_API_KEY=$TINYFISH_API_KEY -- python /path/to/server.py
```
Claude Desktop / any MCP client: command `python`, args `["/path/to/server.py"]`, env `TINYFISH_API_KEY`. Use your own specs: `SITES_DIR=/my/specs python server.py`.
> If `TINYFISH_API_KEY` is already set in your shell it wins over `.env`.

## What ships (3 real sites, 9 spec tools)

| Site (no public API) | Tool | Returns | TinyFish |
|---|---|---|---|
| MIT Course Catalog | `mit_list_departments()` | code, name, url | Fetch |
| | `mit_list_department_courses(department, limit=50)` | code, title, units | Fetch |
| | `mit_search_courses(query, limit=10, department="")` | ranked subjects (title + description match) | Fetch (all dept pages, cached) |
| | `mit_get_course(code)` | description, prerequisites **+ parsed prerequisite codes**, instructors, terms | Fetch |
| NYC Parks events calendar | `list_nyc_parks_event_categories()` | valid category slugs | Fetch |
| | `list_nyc_parks_events(date, category?, borough?, page=1, limit=20)` | name, ISO date, start/end time, venue, park, borough, free, detail url | Fetch |
| | `get_nyc_parks_event(event_url)` | address, cost, organizer, contact | Fetch |
| python.org events | `list_python_events(limit=10)` | name, ISO start/end date, location | Fetch |
| US National Park Service | `get_park_conditions(park)` | alerts + closures (JavaScript-loaded, so an agent reads them) | Agent (+ free Fetch pre-check) |

Every result carries `source_url`. Dates are ISO `YYYY-MM-DD`; times are 24h `HH:MM`.

Multi-step use (agent chains tools): `mit_search_courses` -> `mit_get_course` -> `mit_get_course` on each prerequisite; `list_nyc_parks_event_categories` -> `list_nyc_parks_events` -> `get_nyc_parks_event`. See [`demo/transcript.md`](demo/transcript.md).

## How TinyFish is used
- **Fetch** (`fetch.get_contents`, no browser credits): reads static pages as markdown (+ links). Deterministic parsers in `mit_parsers.py` / `nyc_parsers.py` turn them into typed data in milliseconds. Used wherever the data is in the page, which is most tools, so responses are fast, cheap and repeatable. Fetch also tells us a page does not exist (`page_not_found`), which becomes `NOT_FOUND` with no agent run.
- **Agent** (`agent.run`): opens a page that needs a browser (here NPS alerts, loaded by JavaScript), follows a natural-language goal and returns JSON constrained by an `output_schema` generated from the spec. Use it for pages that need clicking, searching or filling forms.
- Everything is re-validated with pydantic before it reaches the agent, so no raw page dumps.

## Will it work on another site, and is it allowed? `probe.py`
Run this **before** writing a spec:
```bash
python probe.py https://example.org/events          # or: python probe.py --spec sites/my_site.yaml [--json]
```
It checks, in order: **robots.txt** for your path (and crawl-delay); whether **TinyFish Fetch can read** the page; **bot walls / captchas / login walls**; **JS-only shells** (-> use `mode: agent`); **terms-of-use** text that bans scraping/automation; and whether the site advertises an **official API** you should use instead. Verdict: `ALLOWED` (exit 0), `CAUTION` (2, read the notes), `BLOCKED` (1). It is advisory, not legal advice: the terms check is keyword-based.

Enforced at runtime too: before every call a tool checks the site's robots.txt for the exact URL and returns `[BLOCKED]` if automated access is disallowed. Override per tool with `respect_robots: false` only with the site owner's permission. Login-protected, captcha-gated and paid-data sites are out of scope.

## Hosted product (Render + Vercel, no Docker)
`python server.py --http` serves MCP at `/mcp` and REST at `/api/*` with per-user API keys (stored as hashes), per-key rate limits and daily quotas, robots.txt enforcement, CORS allow-list, DNS-rebinding protection and security headers. The TinyFish key stays in the server's environment. `web/` is the React + Tailwind + Motion website (landing, setup with copy-paste configs for Claude, Cursor, ChatGPT and terminal, docs, privacy, terms, security). `cli.py` (`s2m`) is a stdlib-only terminal client; `/api/openapi.json` powers ChatGPT Actions. Full steps: [DEPLOY.md](DEPLOY.md).

## Any URL, no spec: universal tools
Paste a link and go. Each tool checks the site's robots.txt for that exact URL first and returns `[BLOCKED]` if automated access is not allowed.

| Tool | Use |
|---|---|
| `check_site_access(url)` | `ALLOWED` / `CAUTION` / `BLOCKED` + notes (robots, bot wall, login wall, terms wording, official API) |
| `list_events_from_page(url, limit=20)` | typed events (name, ISO start/end, location, url, host) from any event listing, e.g. a Luma city page `https://luma.com/nyc` |
| `extract_from_page(url, instruction, fields, limit=20)` | records with the columns you name, from any public list page |

Verified live on `https://luma.com/nyc` (robots allowed; 4 real events with links in ~90s, because a browser agent scrolls the page). Wrong-field slips (e.g. a venue in an `end` date) are rejected and retried, then fail with `[SITE_CHANGED]`. Spec tools are still better for sites you use daily: they are faster, cheaper and have health checks.

## Add a site (no Python for agent tools)
```yaml
site: my-club
tools:
  - name: check_court_availability
    description: "Free court slots for a date."
    inputs: {date: date, limit: {type: integer, default: 20}}      # types: string integer number boolean date
    url: https://club.example/book?date={date}       # {x} {x|lower} {x|before:.} {x|raw}
    mode: agent                                      # agent | fetch (+ parser: mod:fn) | code (+ handler: mod:fn)
    goal: "List free slots for {date}: court, start_time, end_time."
    output: {slots: [{court: string, start_time: string, end_time: string}]}   # "string?" = optional
    cache_ttl: 600
    health: {args: {date: "today+7"}, expect: ["slots>=1", "slots.court~court"]}
```
Other keys: `inputs.<x>.pattern` (regex, -> `BAD_INPUT`), `found_field` (agent says the thing does not exist -> `NOT_FOUND`), `precheck: true` (free Fetch first, 404 -> `NOT_FOUND`), `nonempty: [field]`, `allow_empty`, `health.args_from` (chain a call, e.g. list -> pick a url -> detail).

## Breaks loudly, not silently
Every error is prefixed with a machine-readable code the agent can act on:

| Code | Meaning |
|---|---|
| `SITE_CHANGED` | page layout / output shape no longer matches (parser found nothing, validation failed, empty result, agent run failed). Agent tools retry once first |
| `NOT_FOUND` | the course / park / event genuinely does not exist |
| `BAD_INPUT` | argument failed validation (message says what is valid) |
| `BLOCKED` | robots.txt disallows automated access |
| `AUTH` / `RATE_LIMIT` / `TIMEOUT` | TinyFish key invalid / throttled / agent run exceeded `AGENT_TIMEOUT` (240s) |

Design rules: no silent empty lists (a list tool that returns nothing is `SITE_CHANGED` unless the spec says `allow_empty`), search never reports "no match" because an agent misread a page, partial multi-page reads fail instead of returning half the data.

## Health check and tests
```bash
python health_check.py                 # LIVE, tools in parallel (~1 min). Exit 1 + "BROKEN <tool>: [SITE_CHANGED] ..." if a site changed
python health_check.py --json          # machine-readable, for CI / dashboards
python health_check.py --canary        # OFFLINE: feeds every tool a "redesigned" site and proves each one fails loudly
python -m pytest                       # offline tests: parsers, typing, error codes, cache, robots, probe, canary
```
[`.github/workflows/health.yml`](.github/workflows/health.yml) runs tests + the live check daily (add `TINYFISH_API_KEY` as a repo secret), so you hear about a site redesign before your agent does. Health args accept `today`, `today+7`.

Reliability: results cached on disk (`.cache/`; agent tools 10 min, catalogue pages 1 day; `SITE_CACHE=0` disables), hard agent timeout, agent tools retry up to `AGENT_ATTEMPTS` (default 3) times on empty or malformed output, then fail loudly.

### Production smoke test
`S2M_KEY=... python smoke_prod.py` checks the deployed server end to end: health, auth rejection, CORS, REST and MCP calls, a bad-input error and one real agent call (`SMOKE_AGENT=0` skips the slow one).

## Layout
`server.py` registers tools · `specs.py` YAML -> typed tools, validation · `tf.py` TinyFish wrapper (errors, cache, timeouts) · `robots.py` robots gate · `probe.py` site vetting · `health_check.py` · `sites/*.yaml` · `mit_parsers.py`, `nyc_parsers.py` · `demo/run_demo.py` · `tests/`

## Demo
**Real conversation:** [`demo/live_session.md`](demo/live_session.md) is Claude using the deployed server on 2026-11-09: access check then Luma events, MIT search then course detail, NYC Parks filtered by borough, including a failure and the fix.

`python demo/run_demo.py` drives the real server over the MCP protocol through a chained multi-tool flow and writes `demo/transcript.md` from the live responses. To see it in a model-driven conversation, add the server to Claude Desktop/Code and ask: *"I'm visiting New York on 2026-11-14 and want to take an algorithms course at MIT next term. Find the course and its prerequisites, something free for kids that day, and Python events I could join."*
