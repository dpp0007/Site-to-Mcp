import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Shell, CodeBlock } from "../components/ui";
import { call, FALLBACK_TOOLS, type ToolInfo } from "../lib/api";
import { API_URL, BRAND } from "../lib/config";

const NAV = [
  ["overview", "Overview"], ["quickstart", "Quickstart"], ["concepts", "How it works"], ["recipes", "Examples"], ["tools", "Tool reference"],
  ["api", "REST and OpenAPI"], ["errors", "Errors"], ["keys", "Keys and limits"], ["reliability", "Reliability"], ["selfhost", "Self-hosting"], ["addsite", "Add a site"], ["faq", "FAQ"],
] as const;

const ERRORS = [
  ["BAD_INPUT", "400", "An argument failed validation.", "Read the message: it says what is valid. Fix the argument and retry."],
  ["UNAUTHORIZED", "401", "Missing, expired or invalid key.", "Generate a new key on the Setup page and update your client."],
  ["BLOCKED", "403", "The site's robots.txt disallows automated access to that URL.", "Stop. Do not retry or look for a workaround."],
  ["NOT_FOUND", "404", "The course, park, event or page does not exist.", "Check the identifier. This is a real answer, not a failure."],
  ["RATE_LIMIT", "429", "Too many requests for this key or network.", "Wait for the Retry-After header, then retry."],
  ["SITE_CHANGED", "502", "The page no longer looks the way the tool expects, or the result was empty when it should not be.", "Retry once. If it persists the site changed: report it, do not trust a partial result."],
  ["TIMEOUT", "504", "The browser agent exceeded its time limit.", "Retry, or use a narrower request (fewer items)."],
];

const ENV = [
  ["TINYFISH_API_KEY", "required", "Your TinyFish key. Server only."],
  ["API_KEYS", "one of these two", "Operator keys as name:sha256 pairs from `python keys.py new <name>`."],
  ["KEY_SECRET", "one of these two", "Random secret that signs self-serve keys. Unset = no Generate button."],
  ["ALLOWED_ORIGINS", "recommended", "Your website's URL, so browsers may call the API (CORS)."],
  ["ALLOWED_HOSTS", "recommended", "Your API hostname (DNS-rebinding protection)."],
  ["PUBLIC_URL", "optional", "Used in the OpenAPI document's server URL."],
  ["RATE_PER_MINUTE / RATE_PER_DAY", "30 / 300", "Limits per operator key."],
  ["USER_PER_MINUTE / USER_PER_DAY", "10 / 60", "Limits per generated key."],
  ["IP_PER_DAY / GLOBAL_PER_DAY", "100 / 1000", "Per-network cap and a total cap for all generated keys (bounds your TinyFish spend)."],
  ["SIGNUP_PER_DAY / KEY_DAYS", "3 / 30", "Keys one network may create per day, and how long they last."],
  ["REVOKED_KEYS", "optional", "Comma-separated ids of generated keys to refuse."],
  ["TRUST_PROXY_HOPS", "1", "Proxies in front of the server that append to X-Forwarded-For."],
  ["AGENT_TIMEOUT / AGENT_ATTEMPTS", "240 / 3", "Seconds per browser-agent run, and tries before failing loudly."],
];

const FAQ = [
  ["Why does the first call take so long?", "Free hosting sleeps after about 15 minutes idle, so the first request can take 30 to 60 seconds. Browser-agent tools also take 20 to 120 seconds on a real page."],
  ["Can I use it from ChatGPT?", "Yes. Add a custom MCP connector with the key in the URL (Authentication: No authentication), or import /api/openapi.json into a custom GPT Action with the key as a Bearer token."],
  ["Why are event times missing for some sites?", "Luma pages return exact start and end times (with the UTC offset) from the event pages themselves. For other sites the browser agent reads whatever times the page shows; if a page shows none, the field is empty."],
  ["Can it read pages behind a login?", "No. Only public pages. Wicket does not log in, solve captchas or fill payment forms."],
  ["Is the access check legal advice?", "No. It reads robots.txt, looks for bot walls and scans the terms for automation wording. It is advisory: you decide."],
];

function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-10 first:border-0 first:pt-0">
      <h2 className="font-display text-[28px] font-[450] tracking-[-0.02em]">{title}</h2>
      <div className="mt-4 space-y-4 text-[16px] leading-[1.65] text-[#3d3d3d] [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_code]:rounded [&_code]:bg-band [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px] [&_h3]:mt-7 [&_h3]:font-display [&_h3]:text-[19px] [&_h3]:font-medium [&_h3]:text-ink">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full text-left text-[14.5px]">
        <thead className="bg-band font-mono text-[11.5px] uppercase tracking-wide text-mute"><tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line align-top">{r.map((c, j) => <td key={j} className={`px-4 py-3 ${j === 0 ? "font-mono text-[13px] text-ink" : "text-mute"}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Docs() {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState("overview");

  useEffect(() => {
    if (!API_URL) return;
    call<{ tools: ToolInfo[] }>(API_URL, "/api/tools").then((r) => r.ok && setTools(r.data.tools));
    call<{ status: string; tools: number; version: string }>(API_URL, "/api/health").then((r) => setStatus(r.ok ? `online · v${r.data.version} · ${r.data.tools} tools` : "unreachable"));
  }, []);

  useEffect(() => {  // highlight the section being read
    const io = new IntersectionObserver((es) => { const v = es.find((e) => e.isIntersecting); if (v) setActive(v.target.id); }, { rootMargin: "-20% 0px -70% 0px" });
    NAV.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  useEffect(() => {  // honour #hash links (e.g. /docs#recipes) after render
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50);
  }, []);

  const list = tools ?? FALLBACK_TOOLS.map((t) => ({ ...t, input_schema: {} }) as ToolInfo);
  const base = API_URL || "https://YOUR-SERVICE.onrender.com";

  return (
    <Shell>
      <div className="mx-auto max-w-6xl gap-14 px-6 pb-24 pt-10 sm:pt-14 lg:grid lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="Documentation" className="sticky top-8 text-[14px]">
            <div className="mb-3 font-mono text-[11.5px] uppercase tracking-wide text-mute">Docs</div>
            <ul className="space-y-0.5">
              {NAV.map(([id, t]) => (
                <li key={id}><a href={`#${id}`} className={`block border-l-2 py-1.5 pl-3 transition-colors ${active === id ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}>{t}</a></li>
              ))}
            </ul>
            <Link to="/setup#key" className="mt-6 block bg-ink px-3.5 py-2.5 text-center text-[14px] text-white transition-opacity hover:opacity-85">Get a free key</Link>
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl space-y-12">
          <header>
            <h1 className="font-display text-[40px] font-[450] leading-[1.05] tracking-[-0.025em] sm:text-[52px]">Documentation</h1>
            <p className="mt-4 text-[18px] leading-[1.5] text-mute">Everything you need to connect {BRAND} to an agent, call its tools, and run it yourself.</p>
            {status && <p className="mt-3 font-mono text-[12.5px] text-mute">Service: {status}</p>}
            <label className="mt-6 block lg:hidden"><span className="sr-only">Jump to section</span>
              <select onChange={(e) => { window.location.hash = e.target.value; }} defaultValue="" className="w-full border border-line bg-white px-3 py-2.5 text-[14px]">
                <option value="" disabled>Jump to a section</option>
                {NAV.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
              </select>
            </label>
          </header>

          <Sec id="overview" title="Overview">
            <p>{BRAND} turns websites that have no API into typed tools an agent can call. You get a hosted server that speaks MCP (for Claude, Cursor and others), REST (for scripts and ChatGPT Actions) and a small CLI.</p>
            <ul>
              <li><b>Typed in, typed out.</b> Every tool has a schema. Results are clean JSON with a <code>source_url</code>, never a page dump.</li>
              <li><b>Access first.</b> <code>check_site_access</code> reads robots.txt, bot walls and terms before anything else runs.</li>
              <li><b>Fails loudly.</b> A changed site gives a clear error code, not a silent empty list.</li>
              <li><b>TinyFish underneath.</b> Fetch reads static pages quickly; a browser agent handles pages that need scrolling or clicking.</li>
            </ul>
          </Sec>

          <Sec id="quickstart" title="Quickstart">
            <ol className="space-y-5">
              <li className="!list-none !ml-0"><b>1. Get a key.</b> On the <Link to="/setup#key">Setup page</Link> press <b>Generate my API key</b>. It is free, needs no sign-up, and lasts 30 days. Copy it immediately: it is shown once.</li>
              <li className="!list-none !ml-0"><b>2. Connect your client.</b> Pick Claude Code, Claude Desktop, Cursor, ChatGPT or the terminal on the Setup page and copy the ready-made config. For Claude Code:
                <div className="mt-3"><CodeBlock label="terminal" code={`claude mcp add --transport http wicket ${base}/mcp --header "Authorization: Bearer YOUR_KEY"`} /></div></li>
              <li className="!list-none !ml-0"><b>3. Ask for something.</b> “Check whether luma.com/delhi allows automation, then list five events there.” The agent calls <code>check_site_access</code> and then <code>list_events_from_page</code>.</li>
            </ol>
          </Sec>

          <Sec id="concepts" title="How it works">
            <h3>The access check</h3>
            <p><code>check_site_access(url)</code> returns <code>ALLOWED</code>, <code>CAUTION</code> or <code>BLOCKED</code> with notes: whether robots.txt allows the URL, whether the page is reachable, whether it looks like a bot wall or login wall, and whether the terms mention restrictions on automation. It is advisory, not legal advice. Every other tool also enforces robots.txt on the exact URL, so a disallowed page returns <code>BLOCKED</code> and nothing is fetched.</p>
            <h3>Fetch and the browser agent</h3>
            <p><b>Fetch</b> reads a page's text and links quickly and repeatably. <b>The browser agent</b> opens the page like a person, scrolls and clicks, and returns what you asked for. Dedicated tools use Fetch where the data is in the page. Universal tools (<code>list_events_from_page</code>, <code>extract_from_page</code>) use the agent for arbitrary sites. Luma pages are read with Fetch only: the city page gives names, hosts and venues, and each event's own page supplies its exact times.</p>
            <h3>Typed results</h3>
            <p>Each tool validates its output against a schema before returning it. If the shape is wrong or a list that should not be empty is empty, you get <code>SITE_CHANGED</code> instead of half an answer.</p>
          </Sec>

          <Sec id="recipes" title="Examples">
            <h3>Events in a city</h3>
            <p>Ask: “What's on in Bengaluru? Check the site first.” The agent runs two tools:</p>
            <CodeBlock label="tool calls" code={`check_site_access(url="https://luma.com/bengaluru")\n  -> {"verdict":"ALLOWED","robots_allowed":true,...}\nlist_events_from_page(url="https://luma.com/bengaluru", limit=10)\n  -> {"source":"fetch","events":[{"name":"...","start":"2026-11-10T18:00:00+05:30","end":"2026-11-10T21:00:00+05:30",\n      "location":"Indiranagar","host":"...","url":"https://luma.com/..."}],"warnings":[]}`} />
            <p>Times are ISO 8601 with the event's own UTC offset. If an event page shows no time, that event's <code>start</code> is empty and <code>warnings</code> says how many.</p>
            <h3>An MIT course and its prerequisites</h3>
            <CodeBlock label="tool calls" code={`mit_search_courses(query="machine learning", limit=3)\n  -> 6.7900 Machine Learning, ...\nmit_get_course(code="6.7900")\n  -> {"prerequisites":"18.06 and (6.3700, 6.3800, or 18.600)",\n      "prerequisite_codes":["18.06","6.3700","6.3800","18.600"],\n      "instructors":["C. Daskalakis","T. Jaakkola"],"terms":["Fall"]}`} />
            <h3>Free things to do in a borough</h3>
            <CodeBlock label="tool call" code={`list_nyc_parks_events(date="2026-11-14", borough="Brooklyn", limit=3)\n  -> {"total_on_date":73,"events":[{"name":"NYRR Open Run: Canarsie Park",\n      "start_time":"08:45","end_time":"10:00","free":true,...}]}`} />
            <h3>A site with no dedicated tool</h3>
            <CodeBlock label="tool call" code={`extract_from_page(url="https://example.org/jobs", instruction="job listings",\n                  fields=["title","company","location","url"], limit=10)`} />
          </Sec>

          <Sec id="tools" title="Tool reference">
            <p>Loaded live from the server when it is reachable. Optional arguments are marked <code>?</code>.</p>
            <div className="divide-y divide-line border-y border-line">
              {list.map((t) => {
                const props = Object.entries(t.input_schema?.properties ?? {});
                return (
                  <div key={t.name} className="py-5">
                    <code className="!bg-transparent !px-0 text-[15px] text-ink">{t.name}</code>
                    <p className="mt-1.5 text-[15px] text-mute">{t.description}</p>
                    {props.length > 0 && (
                      <ul className="mt-3 space-y-1 font-mono text-[12.5px] text-ink">
                        {props.map(([k, v]) => (
                          <li key={k} className="!ml-0 !list-none">{k}{t.input_schema.required?.includes(k) ? "" : "?"}: {v.type ?? v.anyOf?.map((a) => a.type).join(" | ") ?? "any"}{v.default !== undefined ? ` = ${JSON.stringify(v.default)}` : ""}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Sec>

          <Sec id="api" title="REST and OpenAPI">
            <p>The same tools are available over plain HTTP. Send <code>Authorization: Bearer &lt;key&gt;</code>.</p>
            <CodeBlock label="macOS / Linux" code={`curl -s ${base}/api/tools/mit_get_course \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"code":"6.1210"}'`} />
            <CodeBlock label="Windows (one line)" code={`curl -s ${base}/api/tools/mit_get_course -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d "{\\"code\\":\\"6.1210\\"}"`} />
            <Table head={["Endpoint", "Auth", "What it does"]} rows={[
              ["GET /api/health", "none", "Service status, version and tool count."],
              ["GET /api/tools", "none", "Tool names, descriptions and input schemas."],
              ["GET /api/openapi.json", "none", "OpenAPI 3.1 document, for ChatGPT custom GPT Actions."],
              ["POST /api/tools/{name}", "key", "Call a tool with a JSON object of arguments."],
              ["POST /api/keys", "none", "Generate a free key (rate limited per network)."],
              ["POST /mcp", "key", "MCP over Streamable HTTP (stateless, JSON responses)."],
            ]} />
            <p>Errors over REST look like <code>{`{"error":{"code":"BLOCKED","message":"..."}}`}</code>. Over MCP the message starts with <code>[CODE]</code>.</p>
          </Sec>

          <Sec id="errors" title="Errors">
            <p>Every error has a code an agent can act on.</p>
            <Table head={["Code", "HTTP", "Meaning", "What to do"]} rows={ERRORS.map(([c, s, m, a]) => [c, s, m, a])} />
          </Sec>

          <Sec id="keys" title="Keys and limits">
            <ul>
              <li><b>Generated keys</b> start with <code>s2m_u.</code>, last 30 days, and allow 10 requests a minute and 60 a day. At most 3 can be created per network per day.</li>
              <li><b>Operator keys</b> are issued by whoever runs the server and have higher limits. They go in the <code>Authorization</code> header only.</li>
              <li><b>ChatGPT's connector</b> cannot send headers, so a generated key can go in the URL: <code>/mcp/YOUR_KEY</code> or <code>/mcp?key=YOUR_KEY</code>. Treat that URL like a password. Operator keys are never accepted in a URL.</li>
              <li>Requests are limited to 64 KB. Only public pages are supported.</li>
              <li>Lost a key? Generate another. To revoke one, the operator adds its id to <code>REVOKED_KEYS</code>.</li>
            </ul>
          </Sec>

          <Sec id="reliability" title="Reliability">
            <ul>
              <li><b>Cold starts.</b> On free hosting the first call after idle can take 30 to 60 seconds.</li>
              <li><b>Fetch-based tools</b> (MIT, Python events, NYC Parks and Luma pages) take a few seconds and give the same result every time. <b>Browser-agent tools</b> (other sites, park conditions) take 20 to 120 seconds and their output varies: they retry within a time budget, then fail with <code>SITE_CHANGED</code> or <code>TIMEOUT</code>.</li>
              <li><b>Results are cached</b> briefly (10 minutes for agent tools, up to a day for catalogue pages).</li>
              <li><b>Health check.</b> A scheduled job calls every dedicated tool against the real site and fails if one breaks. A built-in canary feeds each tool a redesigned page and proves it fails loudly.</li>
            </ul>
          </Sec>

          <Sec id="selfhost" title="Self-hosting">
            <p>Run your own copy with a TinyFish key. No Docker: the API is a Python service (Render's managed Python works) and the website is static (Vercel).</p>
            <CodeBlock label="locally" code={`pip install git+https://github.com/dpp0007/Site-to-Mcp.git\nexport TINYFISH_API_KEY=...\nsite-to-mcp            # stdio MCP server for Claude Desktop / Claude Code\nsite-to-mcp --http     # hosted mode: needs API_KEYS or KEY_SECRET`} />
            <p>Environment variables for hosted mode:</p>
            <Table head={["Variable", "Default", "Purpose"]} rows={ENV} />
            <p>The repository's <code>DEPLOY.md</code> has the step-by-step for Render and Vercel. Turn off Auto-Deploy on Render if you also deploy manually, so a delayed build cannot replace newer code.</p>
          </Sec>

          <Sec id="addsite" title="Add a site">
            <p>A site is a small YAML file in <code>sites/</code>. Run <code>site-to-mcp-probe URL</code> first to see whether the site allows it and which mode fits.</p>
            <CodeBlock label="sites/python_events.yaml" code={`site: python-org-events\ntools:\n  - name: list_python_events\n    description: "Upcoming Python community events worldwide."\n    inputs:\n      limit: {type: integer, default: 10}\n    url: https://www.python.org/events/python-events/\n    mode: fetch            # fetch | agent | code\n    parser: mit_parsers:python_events\n    output:\n      events: [{name: string, start_date: date, end_date: "date?", location: string}]\n    health:\n      expect: ["events>=3"]`} />
            <p>Agent tools need a <code>goal</code> instead of a <code>parser</code>. The <code>health</code> block is what the daily check runs, so add one for every tool.</p>
          </Sec>

          <Sec id="faq" title="FAQ">
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[17px] font-medium text-ink">{q}<span className="font-mono text-mute transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
                  <p className="mt-2 text-[15.5px] text-mute">{a}</p>
                </details>
              ))}
            </div>
            <p>Still stuck? See <Link to="/setup">Setup</Link> for client-specific steps, or the <Link to="/security">security</Link> page for how keys and limits work.</p>
          </Sec>
        </article>
      </div>
    </Shell>
  );
}
