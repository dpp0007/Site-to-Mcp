import { useEffect, useState } from "react";
import { call, FALLBACK_TOOLS, type ToolInfo } from "../lib/api";
import { API_URL } from "../lib/config";
import { CodeBlock, Page, Section } from "../components/ui";

const ERRORS = [
  ["BAD_INPUT", "400", "An argument failed validation. The message says what is valid."],
  ["UNAUTHORIZED", "401", "Missing or invalid API key."],
  ["BLOCKED", "403", "The site's robots.txt disallows automated access to that URL."],
  ["NOT_FOUND", "404", "The course, park, event or page does not exist."],
  ["RATE_LIMIT", "429", "Too many requests for this key (per minute or per day)."],
  ["SITE_CHANGED", "502", "The page no longer looks the way the tool expects, or the result was empty when it should not be."],
  ["TIMEOUT", "504", "The browser agent exceeded its time limit."],
];

export default function Docs() {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!API_URL) return;
    call<{ tools: ToolInfo[] }>(API_URL, "/api/tools").then((r) => r.ok && setTools(r.data.tools));
    call<{ status: string; tools: number; version: string }>(API_URL, "/api/health").then((r) => setStatus(r.ok ? `online, v${r.data.version}, ${r.data.tools} tools` : "unreachable"));
  }, []);
  const list = tools ?? FALLBACK_TOOLS.map((t) => ({ ...t, input_schema: {} }) as ToolInfo);

  return (
    <Page title="Docs" lead="Every tool has typed inputs and returns clean JSON with a source_url. The same tools are available over MCP, REST and the CLI.">
      {status && <p className="font-mono text-[13px] text-mute">Server: {status}</p>}
      <Section title="How a call works">
        <p>All calls need <code>Authorization: Bearer &lt;key&gt;</code>. Public endpoints: <code>GET /api/health</code>, <code>GET /api/tools</code>, <code>GET /api/openapi.json</code>.</p>
        <CodeBlock label="REST" code={`POST /api/tools/{name}\nContent-Type: application/json\n\n{"url": "https://luma.com/nyc", "limit": 5}`} />
        <CodeBlock label="MCP" code={`POST /mcp   (Streamable HTTP, stateless, JSON responses)`} />
      </Section>
      <Section title="Which tool when">
        <ul>
          <li><b>New site?</b> Call <code>check_site_access</code> first. If it says BLOCKED, stop.</li>
          <li><b>An events page you have a link to?</b> <code>list_events_from_page</code>.</li>
          <li><b>Any other public list?</b> <code>extract_from_page</code> with the columns you want.</li>
          <li><b>MIT, NYC Parks, NPS, python.org?</b> Use the dedicated tools below: faster and cheaper.</li>
        </ul>
      </Section>
      <Section title="Tools">
        <div className="divide-y divide-line border-y border-line">
          {list.map((t) => {
            const props = Object.entries(t.input_schema?.properties ?? {});
            return (
              <div key={t.name} className="py-5">
                <code className="text-[15px]">{t.name}</code>
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
        {!tools && <p className="text-[14px] text-mute">Input details load live when the site is deployed with <code>VITE_API_URL</code>.</p>}
      </Section>
      <Section title="Errors">
        <p>Every error carries a code the agent can act on. In MCP it prefixes the message as <code>[CODE]</code>; over REST it is <code>{`{"error":{"code","message"}}`}</code>.</p>
        <div className="overflow-x-auto border border-line">
          <table className="w-full text-left text-[14.5px]">
            <tbody>
              {ERRORS.map(([c, s, d]) => (
                <tr key={c} className="border-b border-line last:border-0"><td className="px-4 py-3 font-mono text-[13px]">{c}</td><td className="px-2 py-3 font-mono text-[13px] text-mute">{s}</td><td className="px-4 py-3 text-mute">{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Limits">
        <ul>
          <li>Per key: 30 requests a minute and 300 a day by default (the operator can change them).</li>
          <li>Request bodies up to 64 KB. Results cached 10 minutes (agent tools) to a day (catalogue pages).</li>
          <li>Only public pages. No logins, captchas or payment flows.</li>
        </ul>
      </Section>
    </Page>
  );
}
