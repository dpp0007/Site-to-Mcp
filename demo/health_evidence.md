`# Health check evidence
`
`**Live run on GitHub Actions (2026-11-09):** 43 offline tests passed, then `python health_check.py --json` reported `"healthy": true` for every tool against the real sites. Workflow run: https://github.com/dpp0007/Site-to-Mcp/actions/runs/42594842176
`
`**What a broken site looks like.** \`python health_check.py --canary\` feeds every tool a "redesigned" site (offline, no credits) and proves each fails with a clear code instead of returning empty or wrong data:
`
````
`OK     mit_list_departments fails loudly [SITE_CHANGED]
`OK     mit_list_department_courses fails loudly [SITE_CHANGED]
`OK     mit_search_courses fails loudly [SITE_CHANGED]
`OK     mit_get_course fails loudly [SITE_CHANGED]
`OK     get_park_conditions fails loudly [SITE_CHANGED]
`OK     list_nyc_parks_event_categories fails loudly [SITE_CHANGED]
`OK     list_nyc_parks_events fails loudly [SITE_CHANGED]
`OK     get_nyc_parks_event fails loudly [SITE_CHANGED]
`OK     list_python_events fails loudly [SITE_CHANGED]
`all tools healthy
````
`
`In the live check a real change shows as \`BROKEN <tool>: [SITE_CHANGED] ...\` and the workflow exits 1, so the daily run turns red and names the tool.
