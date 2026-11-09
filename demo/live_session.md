# A real Claude session using the hosted server

Not scripted. On 2026-11-09 Claude (Claude Code) was connected to the **production** server
(`https://site-to-mcp.onrender.com/mcp`, Render, Streamable HTTP, Bearer key) and called the tools itself.
Outputs below are the actual responses, trimmed only where marked.

## 1. Vet a new site, then use it (multi-step, universal tools)
**Ask:** "Check whether luma.com/nyc allows automation, then list five events on that page."

| Step | Tool call | Result |
|---|---|---|
| 1 | `check_site_access(url="https://luma.com/nyc")` | `verdict: ALLOWED`, `robots_allowed: true`, `reachable: true`, note "robots.txt allows /nyc" |
| 2 | `list_events_from_page(url="https://luma.com/nyc", limit=5)` | 5 typed events (below) |

```json
{"name": "Junto Founder Dinner (Hosted by Andrew & Friends)", "start": "2026-11-09T18:00", "location": "Tribeca",
 "url": "https://luma.com/events/junto-founder-dinner-hosted-by-andrew-friends", "host": "By Andrew Yeung"}
{"name": "Grid City: Gargoyles and Grotesques", "start": "2026-11-10T07:00", "location": "180 Maiden Ln", "host": "By Benjamin Morrow, ..."}
{"name": "This is Not A CryptoPunk", "start": "2026-11-10T17:00", "location": "NODE Studio NYC", "host": "By NODE"}
... (2 more)
```
Luma has no API for this page; TinyFish Agent scrolled and read it, the tool returned typed events, not page text.

## 2. Different site, chained tools (search, then detail)
**Ask:** "Find an MIT machine learning course and tell me what it requires."

| Step | Tool call | Result |
|---|---|---|
| 1 | `mit_search_courses(query="machine learning", limit=3)` | `6.7900 Machine Learning`, `6.7930[J] Machine Learning for Healthcare`, `HST.956[J] ...` |
| 2 | `mit_get_course(code="6.7900")` | units `3-0-9`, prerequisites `18.06 and (6.3700, 6.3800, or 18.600)`, **parsed** `prerequisite_codes: ["18.06","6.3700","6.3800","18.600"]`, instructors `C. Daskalakis, T. Jaakkola`, terms `["Fall"]` |

The second call used the first call's output. The Fetch parser extracted prerequisites into a typed list.

## 3. Third site, filtered by input
`list_nyc_parks_events(date="2026-11-14", borough="Brooklyn", limit=3)` returned `total_on_date: 73` and typed events with
`start_time`, `end_time`, `venue`, `park`, `borough`, `categories` and `free: true`, for example *NYRR Open Run: Canarsie Park, 08:45-10:00, free*.

## 4. What went wrong, and what we did about it
The first two `list_events_from_page` calls on `luma.com/nyc` failed with `[SITE_CHANGED] no events found`: the TinyFish
agent run completed but returned nothing. The tool did not return an empty list or invented data; it failed loudly with a
reason. Agent output varies run to run, so agent tools now retry up to `AGENT_ATTEMPTS` (default 3) times before failing,
and a third attempt returned the events above. The retry and the loud failure are both covered by offline tests.
