import { Link, NavLink } from "react-router-dom";
import { BRAND, REPO_URL } from "../lib/config";
import { Mark } from "./Mark";

const LINKS = [["Docs", "/docs"], ["Setup", "/setup"], ["Security", "/security"]] as const;

export function Logo() {
  return (
    <Link to="/" aria-label={`${BRAND} home`} className="flex items-center gap-2.5 whitespace-nowrap font-display text-[18px] font-medium tracking-tight text-ink">
      <Mark size={28} />
      {BRAND}
    </Link>
  );
}

/** `overlay` places the bar on the hero stage using the same unit as the layout. */
export function Nav({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay
      ? "relative z-20 order-1 flex items-center justify-between px-6 py-5 lg:absolute lg:left-[calc(288*var(--u))] lg:right-[calc(288*var(--u))] lg:top-[calc(38*var(--u))] lg:p-0"
      : "mx-auto flex max-w-6xl items-center justify-between px-6 py-6"}>
      <Logo />
      <nav aria-label="Main" className="flex items-center gap-1 text-[14px] text-mute">
        {LINKS.map(([t, to]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `hidden rounded-md px-3 py-1.5 transition-colors duration-150 hover:text-ink sm:block ${isActive ? "text-ink" : ""}`}>{t}</NavLink>
        ))}
        {REPO_URL && <a href={REPO_URL} className="hidden rounded-md px-3 py-1.5 transition-colors duration-150 hover:text-ink md:block" rel="noopener">GitHub</a>}
        <Link to="/setup#key" className="ml-2 bg-ink px-3.5 py-1.5 text-[14px] text-white transition-opacity duration-150 hover:opacity-85 active:scale-[.98]">Get a free key</Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-band">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 text-[14px] text-mute sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-[17rem] leading-[1.5]">A small door into the web, for agents. Powered by TinyFish.</p>
        </div>
        <FooterCol title="Product" links={[["Get a free key", "/setup#key"], ["Setup guide", "/setup"], ["Documentation", "/docs"]]} />
        <FooterCol title="Trust" links={[["Security", "/security"], ["Privacy", "/privacy"], ["Terms", "/terms"]]} />
        <div>
          <div className="font-medium text-ink">Connect</div>
          <ul className="mt-3 space-y-2">
            <li>Claude, ChatGPT, Cursor</li>
            <li>Any MCP client</li>
            <li>curl and the CLI</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="font-medium text-ink">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([t, to]) => <li key={to}><Link to={to} className="transition-colors hover:text-ink">{t}</Link></li>)}
      </ul>
    </div>
  );
}
