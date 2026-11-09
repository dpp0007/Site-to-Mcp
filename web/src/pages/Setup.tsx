import { useEffect, useMemo, useState } from "react";
import { call, type ToolInfo } from "../lib/api";
import { API_URL, BRAND, PLACEHOLDER_URL, REPO_URL } from "../lib/config";
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
      "Claude Code": [`claude mcp add --transport http wicket ${base}/mcp \\\n  --header "Authorization: Bearer ${k}"`, "terminal"],
      "Claude Desktop": [JSON.stringify({ mcpServers: { wicket: { command: "npx", args: ["-y", "mcp-remote", `${base}/mcp`, "--header", "Authorization:${AUTH}"], env: { AUTH: `Bearer ${k}` } } } }, null, 2), "claude_desktop_config.json"],
      Cursor: [JSON.stringify({ mcpServers: { wicket: { url: `${base}/mcp`, headers: { Authorization: `Bearer ${k}` } } } }, null, 2), ".cursor/mcp.json"],
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

  const [gen, setGen] = useState("");
  useEffect(() => { if (window.location.hash === "#key") setTimeout(() => document.getElementById("key")?.scrollIntoView({ block: "start" }), 60); }, []);
  const [os, setOs] = useState<"win" | "unix">(typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "win" : "unix");
  const generate = async () => {
    setBusy(true);
    setGen("");
    const r = await call<{ key: string; days: number; limits: { per_minute: number; per_day: number } }>(base, "/api/keys", undefined, {});
    if (r.ok) {
      setKey(r.data.key);
      setHide(false);
      setGen(`Key created and filled in below. Copy it now: it is shown once and is not stored. It works for ${r.data.days} days, ${r.data.limits.per_minute} calls a minute, ${r.data.limits.per_day} a day.`);
    } else setGen(`Could not create a key: ${r.error.message}`);
    setBusy(false);
  };

  const field = "w-full border border-line bg-white px-3 py-2.5 font-mono text-[14px] outline-none transition-colors focus:border-ink";
  const pick = (t: Tab) => snippets.real[t] && <CodeBlock code={snippets.real[t][0]} shown={snippets.shown[t][0]} label={snippets.real[t][1]} />;

  return (
    <Page title={`Set up ${BRAND}`} lead="Three steps: get a key, connect your client, check it works. About a minute.">
      <div id="key" className="scroll-mt-6">
        <Section title="1. Get your key">
          {(() => {
            const f = (
              <label className="block text-[14px] text-mute">Server address
                <input className={`${field} mt-1.5`} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} aria-label="Server address" />
              </label>
            );
            return API_URL ? <details className="text-[14px] text-mute"><summary className="cursor-pointer">Connected to {base.replace(/^https?:\/\//, "")}. Use your own server instead</summary><div className="mt-2">{f}</div></details> : f;
          })()}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={generate} disabled={busy || !live} className="bg-ink px-5 py-3 text-[15px] text-white transition-opacity hover:opacity-85 active:scale-[.98] disabled:opacity-40">{key.startsWith("s2m_u.") ? "Generate another key" : "Generate my API key"}</button>
            <span className="text-[14px] text-mute">Free, no sign-up, lasts 30 days. Or paste a key you were given.</span>
          </div>
          {gen && <p role="status" className="mt-3 border border-mint-line bg-mint px-3.5 py-2.5 text-[14px] text-ink">{gen}</p>}
          <label className="mt-4 block text-[14px] text-mute">Your API key
            <div className="mt-1.5 flex gap-2">
              <input className={field} type={hide ? "password" : "text"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="s2m_..." autoComplete="off" spellCheck={false} aria-label="API key" />
              <button type="button" onClick={() => setHide(!hide)} className="shrink-0 bg-[#e5e5e5] px-3 text-[13px] text-ink transition-colors hover:bg-[#d9d9d9]">{hide ? "Show" : "Hide"}</button>
              {key.trim() && <button type="button" onClick={() => navigator.clipboard?.writeText(key.trim()).catch(() => undefined)} className="shrink-0 bg-[#e5e5e5] px-3 text-[13px] text-ink transition-colors hover:bg-[#d9d9d9]">Copy</button>}
            </div>
          </label>
          <p className="text-[13.5px] text-mute">The key lives in this page's memory only. Reloading clears it, so copy it somewhere safe.</p>
        </Section>
      </div>

      <Section title="2. Connect a client">
        <div role="tablist" aria-label="Client" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-[14px] transition-colors duration-150 ${tab === t ? "bg-ink text-white" : "bg-[#efefef] text-ink hover:bg-[#e5e5e5]"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {tab === "Claude Code" && <>{pick("Claude Code")}<p>Then run <code>/mcp</code> inside Claude Code to confirm <code>wicket</code> is connected.</p></>}
          {tab === "Claude Desktop" && <>{pick("Claude Desktop")}<p>Add this to <code>claude_desktop_config.json</code> (Settings, Developer, Edit config) and restart. Node.js is needed for the <code>mcp-remote</code> bridge. On newer plans you can instead add <code>{base}/mcp</code> as a custom connector.</p></>}
          {tab === "Cursor" && <>{pick("Cursor")}<p>Cursor reads remote servers directly. Reload the window after saving.</p></>}
          {tab === "Any MCP client" && <>{pick("Any MCP client")}<p>Any client that speaks MCP over Streamable HTTP can connect with a Bearer header.</p></>}
          {tab === "ChatGPT" && (
            <>
              <p><b>Option A: custom MCP connector.</b> ChatGPT's connector cannot send a header, so the key goes in the URL. Use a key from the Generate button above (it expires in 30 days). In ChatGPT, add a custom MCP server, set <b>Authentication</b> to <b>No authentication</b>, and use this URL. Treat the URL like a password.</p>
              <CodeBlock code={`${base}/mcp?key=${key.trim().startsWith("s2m_u.") ? key.trim() : "YOUR_GENERATED_KEY"}`} shown={`${base}/mcp?key=${key.trim().startsWith("s2m_u.") ? (hide ? "s2m_u.••••••••" : key.trim()) : "YOUR_GENERATED_KEY"}`} label="Connector URL" />
              <p><b>Option B: custom GPT Action</b> (keeps the key out of the URL). Create a GPT, add an Action, choose <b>Import from URL</b> and paste:</p>
              <CodeBlock code={`${base}/api/openapi.json`} label="Schema URL" />
              <p>Set authentication to <b>API Key</b>, auth type <b>Bearer</b>, and paste your key. Actions time out after roughly a minute, so prefer the fast tools (everything except <code>get_park_conditions</code> and <code>list_events_from_page</code> on slow pages).</p>
            </>
          )}
          {tab === "Terminal" && (() => {
            const nl = "\n";
            const cmds = (k: string) => {
              const cli = [REPO_URL ? `pip install git+${REPO_URL}` : "# run from the repository folder: python cli.py ...",
                "s2m access https://luma.com/nyc", "s2m events https://luma.com/nyc --limit 5", "s2m call mit_get_course code=6.1210"].join(nl);
              const url = `${base}/api/tools/mit_get_course`;
              return os === "win"
                ? { label: "Command Prompt", cli: [`set S2M_URL=${base}`, `set S2M_KEY=${k}`, cli].join(nl),
                    curl: `curl -s ${url} -H "Authorization: Bearer ${k}" -H "Content-Type: application/json" -d "{\\"code\\":\\"6.1210\\"}"` }
                : { label: "bash / zsh", cli: [`export S2M_URL=${base}`, `export S2M_KEY=${k}`, cli].join(nl),
                    curl: [`curl -s ${url} \\`, `  -H "Authorization: Bearer ${k}" \\`, `  -H "Content-Type: application/json" \\`, `  -d '{"code":"6.1210"}'`].join(nl) };
            };
            const r = cmds(real), h = cmds(hide ? masked : real);
            return (
              <>
                <div role="tablist" aria-label="Operating system" className="flex gap-1.5">
                  {([["win", "Windows"], ["unix", "macOS / Linux"]] as const).map(([v, t]) => (
                    <button key={v} role="tab" aria-selected={os === v} onClick={() => setOs(v)} className={`px-3 py-1 text-[13px] ${os === v ? "bg-ink text-white" : "bg-[#efefef] text-ink hover:bg-[#e5e5e5]"}`}>{t}</button>
                  ))}
                </div>
                <CodeBlock label={`curl (${r.label})`} code={r.curl} shown={h.curl} />
                <CodeBlock label="s2m CLI (standard library only)" code={r.cli} shown={h.cli} />
                <p>Output is JSON on stdout. Errors print <code>[CODE] message</code> to stderr with a non-zero exit code, so it composes with scripts and CI.{os === "win" ? " The Windows curl command is one line on purpose: Command Prompt does not support the backslash line breaks used on macOS and Linux." : ""}</p>
              </>
            );
          })()}
        </div>
      </Section>

      <Section title="3. Check it works">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={runTest} disabled={busy || !live} className="bg-ink px-5 py-3 text-[15px] text-white transition-opacity hover:opacity-85 active:scale-[.98] disabled:opacity-40">{busy ? "Testing…" : "Test connection"}</button>
          {!live && <span className="text-[14px] text-mute">Enter your server address to enable the test.</span>}
        </div>
        {test && <p role="status" className="border border-mint-line bg-mint px-3.5 py-2.5 text-[14px] text-ink">{test}</p>}
        <p>Then ask your agent something. Try:</p>
        <CodeBlock code={"Check whether luma.com/delhi allows automation, then list five events there."} />
        <CodeBlock code={"Find an MIT machine learning course and tell me its prerequisites."} />
        <p>It calls <code>check_site_access</code> first. If a site disallows automation you get <code>[BLOCKED]</code> and nothing is fetched. More in the <a href="/docs#recipes">docs</a>.</p>
      </Section>

      <Section title="4. What your agent can use">
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

    </Page>
  );
}
