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
Reading Luma with the browser agent was unreliable from the deployed server: the first two `list_events_from_page` calls
failed with `[SITE_CHANGED] no events found` (the agent run completed but returned nothing), and repeated measurements
succeeded only some of the time even with retries. The tool failed loudly each time rather than returning empty or
invented data. Retrying more did not fix it, so the design changed:

- **Default for Luma pages is TinyFish Fetch only**: names, hosts, venues and links in about 8 seconds, identical on every
  run. Every link is verified against the title on that event's own page, so a name is never paired with the wrong URL.
- Start/end times are drawn by the page's JavaScript and are not in what Fetch returns. The result says so in `warnings`
  and in `source: "fetch"`. Pass `with_dates=true` to read times with the browser agent (slower, may need a retry).
