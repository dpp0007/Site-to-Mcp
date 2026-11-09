import { useEffect, useMemo, useState } from "react";
import { call, type ToolInfo } from "../lib/api";
import { API_URL, PLACEHOLDER_URL, REPO_URL } from "../lib/config";
import { CodeBlock, Page, Section } from "../components/ui";

const TABS = ["Claude Code", "Claude Desktop", "Cursor", "ChatGPT", "Terminal", "Any MCP client"] as const;
type Tab = (typeof TABS)[number];

export default function Setup() {
  const [url, setUrl] = useState(API_URL || PLACEHOLDER_URL);
  const [key, setKey] = useState("");
  const [hide, setHide] = useState(true);
  const [tab, setTab] = useState<Tab>("Claude Code");
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [test, setTest] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const base = url.replace(/\/$/, "");
  const real = key.trim() || "YOUR_API_KEY";
  const masked = key.trim() ? "s2m_••••••••" : "YOUR_API_KEY";
  const live = base !== PLACEHOLDER_URL && /^https?:\/\//.test(base);

  useEffect(() => {
    if (!live) { setTools(null); return; }
    let on = true;
    const t = setTimeout(async () => {
      const r = await call<{ tools: ToolInfo[] }>(base, "/api/tools");
      if (on) setTools(r.ok ? r.data.tools : null);
    }, 400);
    return () => { on = false; clearTimeout(t); };
  }, [base, live]);

  const snippets = useMemo(() => {
    const make = (k: string) => ({
      "Claude Code": [`claude mcp add --transport http site-to-mcp ${base}/mcp \\\n  --header "Authorization: Bearer ${k}"`, "terminal"],
      "Claude Desktop": [JSON.stringify({ mcpServers: { "site-to-mcp": { command: "npx", args: ["-y", "mcp-remote", `${base}/mcp`, "--header", "Authorization:${AUTH}"], env: { AUTH: `Bearer ${k}` } } } }, null, 2), "claude_desktop_config.json"],
      Cursor: [JSON.stringify({ mcpServers: { "site-to-mcp": { url: `${base}/mcp`, headers: { Authorization: `Bearer ${k}` } } } }, null, 2), ".cursor/mcp.json"],
      "Any MCP client": [`URL:     ${base}/mcp\nHeader:  Authorization: Bearer ${k}\nTransport: Streamable HTTP (stateless, JSON responses)`, "settings"],
    } as Record<string, [string, string]>);
    return { real: make(real), shown: make(hide ? masked : real) };
  }, [base, real, masked, hide]);

  const runTest = async () => {
    setBusy(true);
    setTest("");
    const h = await call<{ status: string; tools: number }>(base, "/api/health");
    if (!h.ok) { setTest(`Server: ${h.error.code}. ${h.error.message}`); setBusy(false); return; }
    let msg = `Server is up, ${h.data.tools} tools.`;
    if (!key.trim()) { setTest(msg + " Enter your API key to test it."); setBusy(false); return; }
    const a = await call<{ verdict: string }>(base, "/api/tools/check_site_access", key.trim(), { url: "https://luma.com/nyc" });
    msg += a.ok ? ` Key works: check_site_access(luma.com/nyc) returned ${a.data.verdict}.` : ` Key check failed: [${a.error.code}] ${a.error.message}`;
    setTest(msg);
    setBusy(false);
  };

  const field = "w-full border border-line bg-white px-3 py-2.5 font-mono text-[14px] outline-none transition-colors focus:border-ink";
  const pick = (t: Tab) => snippets.real[t] && <CodeBlock code={snippets.real[t][0]} shown={snippets.shown[t][0]} label={snippets.real[t][1]} />;

  return (
    <Page title="Set up your agent" lead="Connect once, then every MCP client, script and terminal can use the same tools. Your API key stays in this page's memory: it is never stored, and only sent to the server address below when you press Test.">
      <Section title="1. Your server and key">
        <label className="block text-[14px] text-mute">Server address
          <input className={`${field} mt-1.5`} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} aria-label="Server address" />
        </label>
        <label className="mt-4 block text-[14px] text-mute">API key (from the service operator)
          <div className="mt-1.5 flex gap-2">
            <input className={field} type={hide ? "password" : "text"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="s2m_..." autoComplete="off" spellCheck={false} aria-label="API key" />
            <button type="button" onClick={() => setHide(!hide)} className="shrink-0 bg-[#e5e5e5] px-3 text-[13px] text-ink transition-colors hover:bg-[#d9d9d9]">{hide ? "Show" : "Hide"}</button>
          </div>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={runTest} disabled={busy || !live} className="bg-ink px-4 py-2.5 text-[14px] text-white transition-opacity active:scale-[.98] disabled:opacity-40">{busy ? "Testing..." : "Test connection"}</button>
          {!live && <span className="text-[14px] text-mute">Enter your deployed server address to enable the test.</span>}
        </div>
        {test && <p role="status" className="border border-line bg-mint px-3 py-2 text-[14px] text-ink">{test}</p>}
      </Section>

      <Section title="2. Connect a client">
        <div role="tablist" aria-label="Client" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-[14px] transition-colors duration-150 ${tab === t ? "bg-ink text-white" : "bg-[#efefef] text-ink hover:bg-[#e5e5e5]"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {tab === "Claude Code" && <>{pick("Claude Code")}<p>Then run <code>/mcp</code> inside Claude Code to confirm <code>site-to-mcp</code> is connected.</p></>}
          {tab === "Claude Desktop" && <>{pick("Claude Desktop")}<p>Add this to <code>claude_desktop_config.json</code> (Settings, Developer, Edit config) and restart. Node.js is needed for the <code>mcp-remote</code> bridge. On newer plans you can instead add <code>{base}/mcp</code> as a custom connector.</p></>}
          {tab === "Cursor" && <>{pick("Cursor")}<p>Cursor reads remote servers directly. Reload the window after saving.</p></>}
          {tab === "Any MCP client" && <>{pick("Any MCP client")}<p>Any client that speaks MCP over Streamable HTTP can connect with a Bearer header.</p></>}
          {tab === "ChatGPT" && (
            <>
              <p>ChatGPT calls tools through a custom GPT Action. Create a GPT, add an Action, choose <b>Import from URL</b> and paste:</p>
              <CodeBlock code={`${base}/api/openapi.json`} label="Schema URL" />
              <p>Set authentication to <b>API Key</b>, auth type <b>Bearer</b>, and paste your key. Actions time out after roughly a minute, so prefer the fast tools (everything except <code>get_park_conditions</code> and <code>list_events_from_page</code> on slow pages).</p>
            </>
          )}
          {tab === "Terminal" && (
            <>
              <CodeBlock label="curl" code={`curl -s ${base}/api/tools/mit_get_course \\\n  -H "Authorization: Bearer ${real}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"code":"6.1210"}'`} shown={`curl -s ${base}/api/tools/mit_get_course \\\n  -H "Authorization: Bearer ${hide ? masked : real}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"code":"6.1210"}'`} />
              <CodeBlock label="s2m CLI (standard library only)" code={`export S2M_URL=${base}\nexport S2M_KEY=${real}\n${REPO_URL ? `pip install git+${REPO_URL}\n` : "# pip install the repository, or run: python cli.py ...\n"}s2m access https://luma.com/nyc\ns2m events https://luma.com/nyc --limit 5\ns2m call mit_get_course code=6.1210`} shown={`export S2M_URL=${base}\nexport S2M_KEY=${hide ? masked : real}\n${REPO_URL ? `pip install git+${REPO_URL}\n` : "# pip install the repository, or run: python cli.py ...\n"}s2m access https://luma.com/nyc\ns2m events https://luma.com/nyc --limit 5\ns2m call mit_get_course code=6.1210`} />
              <p>Output is JSON on stdout. Errors print <code>[CODE] message</code> to stderr with a non-zero exit code, so it composes with shell scripts and CI.</p>
            </>
          )}
        </div>
      </Section>

      <Section title="3. What your agent can use">
        {tools ? (
          <ul className="!ml-0 divide-y divide-line border-y border-line">
            {tools.map((t) => (
              <li key={t.name} className="!ml-0 !list-none py-3">
                <code>{t.name}</code>
                <p className="mt-1 text-[14.5px] text-mute">{t.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>Live list loads from your server once the address above is reachable. Full reference: <a href="/docs">Docs</a>.</p>
        )}
      </Section>

      <Section title="Try it">
        <p>Ask your agent: <i>“Check whether luma.com/nyc allows automation, then list five events on that page.”</i> It will call <code>check_site_access</code> first, then <code>list_events_from_page</code>. If a site disallows automated access you get <code>[BLOCKED]</code> and nothing is fetched.</p>
      </Section>
    </Page>
  );
}
