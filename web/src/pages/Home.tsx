import { motion } from "motion/react";
import { Link } from "react-router-dom";
import AccessCheck from "../components/AccessCheck";
import Hero from "../components/Hero";
import { Footer } from "../components/Nav";
import { FALLBACK_TOOLS } from "../lib/api";

const rise = { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] as const } };
const h2 = "font-display text-[32px] font-[450] tracking-[-0.02em] sm:text-[40px]";

const STEPS = [
  ["01", "Paste a link", "Any public page: a city calendar, a course catalogue, an events list."],
  ["02", "Access is checked first", "robots.txt, bot walls, login walls and terms wording are checked. If the site disallows automation, nothing is fetched."],
  ["03", "TinyFish does the work", "Fetch reads static pages quickly; a browser agent scrolls and clicks the rest. You get typed JSON, never a page dump."],
];
const CLIENTS = ["Claude Desktop", "Claude Code", "Cursor", "ChatGPT", "Any MCP client", "curl and the CLI"];
const SAFE = [
  ["Keys stay on the server", "The TinyFish key lives only in the server's environment. Clients get their own keys, which expire or can be revoked."],
  ["Respects the web", "robots.txt is enforced on every call. Blocked sites return [BLOCKED], not a workaround."],
  ["Limits and quotas", "Per-key and per-IP rate limits and a daily cap bound abuse and spend. Request bodies are capped."],
  ["Loud, typed errors", "SITE_CHANGED, NOT_FOUND, BAD_INPUT, BLOCKED. A tool never returns an empty list when it is really broken."],
];
const FAQ = [
  ["Is it free?", "Getting a key is free and needs no sign-up. Keys last 30 days and have fair-use limits, so the hosted service stays available to everyone. You can self-host without limits."],
  ["Does it work with ChatGPT?", "Yes, in two ways: add it as a custom MCP connector (the key goes in the URL), or import the OpenAPI schema into a custom GPT Action. The Setup page has both."],
  ["What if a site doesn't allow bots?", "The access check says BLOCKED and every tool refuses to run on that URL. Wicket never works around a site's robots.txt."],
  ["How fast is it?", "Pages Wicket can read with TinyFish Fetch (Luma, MIT, NYC Parks, python.org) come back in a few seconds with the same result every time. Pages that need a browser agent, such as park alerts, take 20 to 120 seconds."],
  ["What happens when a website changes?", "The tool fails with SITE_CHANGED and says what it expected. A daily health check runs against the real sites, so a breakage is caught before your agent hits it."],
  ["Where does my data go?", "Only the page address and your arguments are sent to TinyFish to read the public page. We keep no account, no analytics and no request bodies. See the privacy page."],
];

function Chat() {
  const rows = [
    ["Ōta Clash: Delhi", "MAAC Rajouri", "Tony Aar"],
    ["Community Run with Kartikeya", "Blue Tokai, Mehar Chand Market", "Kartikeya Sinha"],
    ["Beyond the Browser", "Paytm", "Indian Data Club"],
  ];
  return (
    <div className="border border-line bg-page">
      <div className="border-b border-line px-5 py-3 font-mono text-[12px] text-mute">A real session in Claude</div>
      <div className="space-y-4 p-5 text-[15px] sm:p-6">
        <p className="ml-auto max-w-[85%] bg-band px-4 py-3">What's happening in Delhi this week? Check the site allows it first.</p>
        <p className="break-words font-mono text-[12.5px] text-mute">check_site_access(url=&quot;luma.com/delhi&quot;) → <span className="text-ink">ALLOWED</span></p>
        <p className="break-words font-mono text-[12.5px] text-mute">list_events_from_page(url=&quot;luma.com/delhi&quot;, limit=3) → <span className="text-ink">3 events with times, in seconds</span></p>
        <div className="overflow-x-auto border border-line">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-band font-mono text-[11.5px] uppercase tracking-wide text-mute"><tr><th className="px-3 py-2 font-normal">Event</th><th className="px-3 py-2 font-normal">Where</th><th className="px-3 py-2 font-normal">Host</th></tr></thead>
            <tbody>{rows.map(([a, b, c]) => <tr key={a} className="border-t border-line"><td className="px-3 py-2.5">{a}</td><td className="px-3 py-2.5 text-mute">{b}</td><td className="px-3 py-2.5 text-mute">{c}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="text-mute">Luma has no API. Three typed rows came back, each with its own link.</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-page">
      <Hero />
      <main>
        <section id="try" className="mx-auto max-w-6xl scroll-mt-6 px-6 py-24">
          <motion.h2 {...rise} className={h2}>Try it on any site, right now</motion.h2>
          <p className="mt-4 max-w-2xl text-[17px] text-mute">This is the first thing every agent does with Wicket: ask whether a site allows automation. No account, no key to paste.</p>
          <div className="mt-8 max-w-3xl"><AccessCheck /></div>
        </section>

        <section className="bg-band">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <motion.h2 {...rise} className={h2}>From a link to typed data in three steps</motion.h2>
            <div className="mt-12 grid gap-px bg-line sm:grid-cols-3">
              {STEPS.map(([n, t, d], i) => (
                <motion.div key={n} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }} className="bg-band p-7">
                  <div className="font-mono text-[13px] text-mute">{n}</div>
                  <h3 className="mt-6 font-display text-[21px] font-medium tracking-tight">{t}</h3>
                  <p className="mt-2 text-[15.5px] leading-[1.55] text-mute">{d}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div className="min-w-0">
            <motion.h2 {...rise} className={h2}>Your agent asks. The web answers.</motion.h2>
            <p className="mt-4 max-w-md text-[17px] leading-[1.5] text-mute">Wicket gives an agent clear tools instead of a browser to puzzle over: check the site, list the events, get the course, with the same result shape every time.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link to="/setup#key" className="bg-ink px-5 py-3 text-[15px] text-white transition-opacity duration-150 hover:opacity-85 active:scale-[.98]">Get a free key</Link>
              <Link to="/docs#recipes" className="text-[15px] underline decoration-line underline-offset-[5px] transition-colors hover:decoration-ink">See more examples</Link>
            </div>
          </div>
          <motion.div {...rise} className="min-w-0"><Chat /></motion.div>
        </section>

        <section className="bg-band">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <motion.h2 {...rise} className={h2}>Works from anything that speaks MCP</motion.h2>
            <p className="mt-4 max-w-2xl text-[17px] text-mute">One hosted server, every client. Connect once with a URL and a key.</p>
            <ul className="mt-10 flex flex-wrap gap-2.5">
              {CLIENTS.map((c) => <li key={c} className="border border-line bg-page px-4 py-2.5 text-[15px]">{c}</li>)}
            </ul>
            <Link to="/setup" className="mt-10 inline-flex bg-ink px-5 py-3 text-[15px] text-white transition-opacity duration-150 hover:opacity-85 active:scale-[.98]">Pick your client</Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2 {...rise} className={h2}>Tools your agent gets</motion.h2>
          <ul className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FALLBACK_TOOLS.map((t) => (
              <li key={t.name} className="bg-page p-6">
                <code className="font-mono text-[13.5px]">{t.name}</code>
                <p className="mt-2 text-[15px] leading-[1.5] text-mute">{t.description}</p>
              </li>
            ))}
          </ul>
          <Link to="/docs#tools" className="mt-8 inline-block text-[15px] underline underline-offset-4">Read the full tool reference</Link>
        </section>

        <section className="bg-band">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <motion.h2 {...rise} className={h2}>Safe by design</motion.h2>
            <dl className="mt-12 grid gap-10 sm:grid-cols-2">
              {SAFE.map(([t, d]) => (
                <motion.div key={t} {...rise}>
                  <dt className="font-display text-[20px] font-medium tracking-tight">{t}</dt>
                  <dd className="mt-2 text-[15.5px] leading-[1.55] text-mute">{d}</dd>
                </motion.div>
              ))}
            </dl>
            <p className="mt-10 text-[15px] text-mute">Details on the <Link to="/security" className="underline underline-offset-4">security</Link> and <Link to="/privacy" className="underline underline-offset-4">privacy</Link> pages.</p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-24">
          <motion.h2 {...rise} className={h2}>Questions</motion.h2>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-[19px] font-medium tracking-tight">
                  {q}<span className="font-mono text-[18px] text-mute transition-transform duration-150 group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[16px] leading-[1.6] text-mute">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-ink-2 text-page">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <h2 className="mx-auto max-w-2xl font-display text-[36px] font-[450] leading-[1.05] tracking-[-0.025em] sm:text-[52px]">Open a door for your agent.</h2>
            <p className="mx-auto mt-5 max-w-lg text-[17px] text-[#b9b9b9]">Get a key in one click and connect Claude, ChatGPT or your terminal in a minute.</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
              <Link to="/setup#key" className="bg-page px-6 py-3.5 text-[16px] text-ink transition-opacity duration-150 hover:opacity-90 active:scale-[.98]">Get a free key</Link>
              <Link to="/docs" className="text-[16px] text-page underline decoration-[#555] underline-offset-[5px] transition-colors hover:decoration-page">Read the docs</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
