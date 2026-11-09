import { Link } from "react-router-dom";
import { Nav } from "./Nav";
import Orbit from "./Orbit";

/** Layout proportions from the reference frame (1896 x 1080): one unit --u = one source pixel. */
const STATS = [["12", "typed tools"], ["robots.txt", "checked on every call"], ["JSON", "never raw page dumps"], ["0", "secrets in your browser"]];

export default function Hero() {
  return (
    <>
      <section className="relative flex flex-col overflow-hidden bg-page pb-10 lg:block lg:h-[calc(958*var(--u))] lg:pb-0" style={{ ["--u" as string]: "calc(100vw / 1896)" }}>
        <Orbit />
        <Nav overlay />
        <div className="relative z-10 order-2 px-6 pt-6 lg:static lg:p-0">
          <h1 className="font-display text-[40px] font-[450] leading-[1.04] tracking-[-0.025em] sm:text-[52px] lg:absolute lg:left-[calc(288*var(--u))] lg:top-[calc(198*var(--u))] lg:text-[length:calc(62*var(--u))] lg:leading-[calc(60*var(--u))]">
            <span className="block text-ink">The web has no API.</span>
            <span className="block text-mute">Wicket gives it one.</span>
          </h1>
          <p className="mt-8 max-w-[26rem] text-[17px] leading-[1.3] text-mute lg:absolute lg:left-[calc(288*var(--u))] lg:top-[calc(692*var(--u))] lg:mt-0 lg:w-[calc(400*var(--u))] lg:max-w-none lg:text-[length:calc(17*var(--u))] lg:leading-[calc(22*var(--u))]">
            Paste a link. Wicket checks the site allows automation, TinyFish reads it, and your agent gets typed data back. Free key, no sign-up.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 lg:absolute lg:left-[calc(289*var(--u))] lg:top-[calc(793*var(--u))] lg:mt-0 lg:flex-nowrap lg:gap-x-[calc(24*var(--u))]">
            <Link to="/setup#key" className="inline-flex items-center justify-center bg-ink px-4 py-2.5 text-[15px] text-white transition-opacity duration-150 hover:opacity-85 active:scale-[.98] lg:h-[calc(39*var(--u))] lg:min-w-[calc(150*var(--u))] lg:whitespace-nowrap lg:p-0 lg:text-[length:calc(15*var(--u))]">
              Get a free key
            </Link>
            <a href="#try" className="whitespace-nowrap text-[15px] text-ink underline decoration-line underline-offset-[5px] transition-colors duration-150 hover:decoration-ink lg:text-[length:calc(15*var(--u))]">Check a site now</a>
          </div>
        </div>
      </section>
      <section className="bg-band" style={{ ["--u" as string]: "calc(100vw / 1896)" }}>
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-6 py-8 sm:grid-cols-4 lg:mx-0 lg:h-[calc(122*var(--u))] lg:max-w-none lg:items-center lg:gap-0 lg:py-0 lg:pl-[calc(288*var(--u))] lg:pr-[calc(288*var(--u))]">
          {STATS.map(([k, v]) => (
            <div key={k}>
              <dt className="font-display text-[22px] font-medium tracking-tight text-ink">{k}</dt>
              <dd className="mt-0.5 text-[13.5px] text-mute">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
