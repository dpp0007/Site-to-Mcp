import { useState } from "react";
import { call } from "../lib/api";
import { API_URL } from "../lib/config";
import { demoKey, forgetDemoKey } from "../lib/session";

type Access = { verdict: "ALLOWED" | "CAUTION" | "BLOCKED"; robots_allowed: boolean; reachable: boolean; notes: string[]; suggested_mode?: string | null };

const TONE = { ALLOWED: "bg-mint text-ink border-mint-line", CAUTION: "bg-[#fff6e0] text-ink border-[#f0dca4]", BLOCKED: "bg-[#fdeaea] text-ink border-[#f0c4c4]" };
const EXAMPLES = ["https://luma.com/delhi", "https://catalog.mit.edu/subjects/", "https://www.linkedin.com/"];

/** Live demo of the first thing every agent should do: ask whether a site allows automation. No setup needed. */
export default function AccessCheck() {
  const [url, setUrl] = useState("https://luma.com/bengaluru");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Access | null>(null);
  const [err, setErr] = useState("");

  const run = async (target = url) => {
    if (!API_URL) { setErr("The demo is not connected to a server yet."); return; }
    setBusy(true); setErr(""); setRes(null);
    let k = await demoKey();
    if (!k.ok) { setErr(k.message); setBusy(false); return; }
    let r = await call<Access>(API_URL, "/api/tools/check_site_access", k.key, { url: target.trim() });
    if (!r.ok && r.error.code === "UNAUTHORIZED") {  // stored key expired or was revoked: mint a new one once
      forgetDemoKey();
      k = await demoKey();
      if (k.ok) r = await call<Access>(API_URL, "/api/tools/check_site_access", k.key, { url: target.trim() });
    }
    if (r.ok) setRes(r.data); else setErr(r.error.message);
    setBusy(false);
  };

  return (
    <div className="border border-line bg-page p-5 sm:p-7">
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="check-url">Website address</label>
        <input id="check-url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} inputMode="url" placeholder="https://example.com/events"
          className="min-w-0 flex-1 border border-line bg-white px-3.5 py-3 font-mono text-[14px] outline-none transition-colors focus:border-ink" />
        <button type="submit" disabled={busy || !url.trim()} className="bg-ink px-5 py-3 text-[15px] text-white transition-opacity hover:opacity-85 active:scale-[.98] disabled:opacity-40">
          {busy ? "Checking…" : "Check access"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-mute">
        Try:
        {EXAMPLES.map((x) => (
          <button key={x} type="button" onClick={() => { setUrl(x); run(x); }} className="border border-line px-2.5 py-1 font-mono text-[12px] text-ink transition-colors hover:border-ink">{x.replace("https://", "").replace(/\/$/, "")}</button>
        ))}
      </div>
      <div aria-live="polite" className="mt-5 min-h-[3rem]">
        {err && <p className="border border-[#f0c4c4] bg-[#fdeaea] px-3.5 py-2.5 text-[14px]">{err}</p>}
        {res && (
          <div className={`border px-4 py-3.5 ${TONE[res.verdict]}`}>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] font-medium tracking-wide">{res.verdict}</span>
              <span className="text-[14px] text-[#3d3d3d]">{res.verdict === "ALLOWED" ? "An agent can use this site." : res.verdict === "CAUTION" ? "Usable, read the notes first." : "Do not automate this site."}</span>
            </div>
            <ul className="mt-2 space-y-1 text-[14px] text-[#3d3d3d]">
              {res.notes.map((n) => <li key={n} className="!ml-0 !list-none">· {n}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
