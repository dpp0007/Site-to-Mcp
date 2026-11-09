import { Link, NavLink } from "react-router-dom";

const LINKS = [["Setup", "/setup"], ["Docs", "/docs"], ["Security", "/security"]] as const;

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap font-display text-[17px] font-medium tracking-tight text-ink">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#070707" /><path d="M8 11l7 5-7 5zM24 11l-7 5 7 5z" fill="#fcfcfc" /></svg>
      site-to-mcp
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
          <NavLink key={to} to={to} className={({ isActive }) => `rounded-md px-3 py-1.5 transition-colors duration-150 hover:text-ink ${isActive ? "text-ink" : ""}`}>{t}</NavLink>
        ))}
        <Link to="/setup" className="ml-2 hidden bg-[#e5e5e5] px-3.5 py-1.5 text-[14px] text-ink transition-colors duration-150 hover:bg-[#dadada] active:scale-[.98] sm:block">Get started</Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-band">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-[14px] text-mute sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/setup" className="hover:text-ink">Setup</Link>
          <Link to="/docs" className="hover:text-ink">Docs</Link>
          <Link to="/security" className="hover:text-ink">Security</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <Link to="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
