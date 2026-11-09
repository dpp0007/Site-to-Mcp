export type ToolInfo = { name: string; description: string; input_schema: { properties?: Record<string, { type?: string; description?: string; default?: unknown; anyOf?: { type?: string }[] }>; required?: string[] } };
export type ApiError = { code: string; message: string };

/** Fetch JSON from the service. Never throws: returns {ok:false,error} with a readable message. */
export async function call<T>(base: string, path: string, key?: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const r = await fetch(base.replace(/\/$/, "") + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (r.ok) return { ok: true, data: j as T };
    return { ok: false, error: j?.error ?? { code: `HTTP_${r.status}`, message: r.statusText } };
  } catch {
    return { ok: false, error: { code: "UNREACHABLE", message: "Could not reach the server. Check the URL, and that the server allows this site's origin (ALLOWED_ORIGINS)." } };
  }
}

export const FALLBACK_TOOLS: Pick<ToolInfo, "name" | "description">[] = [
  { name: "check_site_access", description: "Does the site allow automated access to this URL? ALLOWED, CAUTION or BLOCKED, with notes." },
  { name: "list_events_from_page", description: "Typed events from any event-listing page, e.g. a Luma city page." },
  { name: "extract_from_page", description: "Records with the columns you name, from any public list page." },
  { name: "mit_search_courses", description: "Keyword search across all MIT subjects." },
  { name: "mit_get_course", description: "Description, prerequisites, instructors and terms for one MIT subject." },
  { name: "mit_list_departments", description: "All MIT departments with their course-number prefix." },
  { name: "mit_list_department_courses", description: "Subjects in one MIT department." },
  { name: "get_park_conditions", description: "Current alerts and closures for a US National Park." },
  { name: "list_nyc_parks_events", description: "NYC Parks events on a date, by category and borough." },
  { name: "get_nyc_parks_event", description: "Full detail for one NYC Parks event." },
  { name: "list_nyc_parks_event_categories", description: "Valid category slugs for NYC Parks events." },
  { name: "list_python_events", description: "Upcoming Python community events worldwide." },
];
