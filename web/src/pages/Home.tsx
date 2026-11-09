import { motion } from "motion/react";
import { Link } from "react-router-dom";
import Hero from "../components/Hero";
import { Footer } from "../components/Nav";
import { FALLBACK_TOOLS } from "../lib/api";

const rise = { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] as const } };

const STEPS = [
  ["01", "Paste a link", "Any public page: a city calendar, a course catalogue, an events list."],
  ["02", "Access is checked first", "robots.txt, bot walls, login walls and terms wording are checked. If the site disallows automation, nothing is fetched."],
  ["03", "TinyFish does the work", "Fetch reads static pages for free; a browser agent scrolls and clicks the rest. You get typed JSON, never a page dump."],
];
const CLIENTS = ["Claude Desktop", "Claude Code", "Cursor", "ChatGPT Actions", "Any MCP client", "curl and the s2m CLI"];
const SAFE = [
  ["Keys stay on the server", "The TinyFish key lives only in the server's environment. Clients get their own revocable keys, stored as SHA-256 hashes."],
  ["Respects the web", "robots.txt is enforced on every call. Blocked sites return [BLOCKED], not a workaround."],
  ["Limits and quotas", "Per-key rate limits and a daily cap bound both abuse and spend. Request bodies are capped."],
  ["Loud, typed errors", "SITE_CHANGED, NOT_FOUND, BAD_INPUT, BLOCKED. A tool never returns an empty list when it is really broken."],
];

export default function Home() {
  return (
    <div className="bg-page">
      <Hero />
      <main>
        <section className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2 {...rise} className="font-display text-[32px] font-[450] tracking-[-0.02em] sm:text-[40px]">From a link to typed data in three steps</motion.h2>
          <div className="mt-12 grid gap-px bg-line sm:grid-cols-3">
            {STEPS.map(([n, t, d], i) => (
              <motion.div key={n} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }} className="bg-page p-7">
                <div className="font-mono text-[13px] text-mute">{n}</div>
                <h3 className="mt-6 font-display text-[21px] font-medium tracking-tight">{t}</h3>
                <p className="mt-2 text-[15.5px] leading-[1.55] text-mute">{d}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="bg-band">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <motion.h2 {...rise} className="font-display text-[32px] font-[450] tracking-[-0.02em] sm:text-[40px]">Works from anything that speaks MCP</motion.h2>
            <p className="mt-4 max-w-2xl text-[17px] text-mute">One hosted server, every client. Connect once with a URL and a key.</p>
            <ul className="mt-10 flex flex-wrap gap-2.5">
              {CLIENTS.map((c) => <li key={c} className="border border-line bg-page px-4 py-2.5 text-[15px]">{c}</li>)}
            </ul>
            <Link to="/setup" className="mt-10 inline-flex bg-ink px-5 py-3 text-[15px] text-white transition-opacity duration-150 hover:opacity-85 active:scale-[.98]">Open the setup page</Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2 {...rise} className="font-display text-[32px] font-[450] tracking-[-0.02em] sm:text-[40px]">Tools your agent gets</motion.h2>
          <ul className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FALLBACK_TOOLS.map((t) => (
              <li key={t.name} className="bg-page p-6">
                <code className="font-mono text-[13.5px]">{t.name}</code>
                <p className="mt-2 text-[15px] leading-[1.5] text-mute">{t.description}</p>
              </li>
            ))}
          </ul>
          <Link to="/docs" className="mt-8 inline-block text-[15px] underline underline-offset-4">Read the full reference</Link>
        </section>

        <section className="bg-band">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <motion.h2 {...rise} className="font-display text-[32px] font-[450] tracking-[-0.02em] sm:text-[40px]">Safe by design</motion.h2>
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
      </main>
      <Footer />
    </div>
  );
}
