import { useState, type ReactNode } from "react";
import { Footer, Nav } from "./Nav";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}

export function Page({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-6 pb-24 pt-10 sm:pt-16">
        <h1 className="font-display text-[38px] font-[450] leading-[1.05] tracking-[-0.025em] sm:text-[52px]">{title}</h1>
        {lead && <p className="mt-5 text-[18px] leading-[1.45] text-mute">{lead}</p>}
        <div className="mt-12 space-y-10">{children}</div>
      </article>
    </Shell>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[24px] font-medium tracking-[-0.015em]">{title}</h2>
      <div className="mt-3 space-y-3 text-[16px] leading-[1.6] text-[#3d3d3d] [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_code]:rounded [&_code]:bg-band [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px]">{children}</div>
    </section>
  );
}

/** Code with a copy button. `shown` lets the visible text be masked while `code` (what is copied) stays real. */
export function CodeBlock({ code, shown, label }: { code: string; shown?: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard blocked: the text is still selectable */ }
  };
  return (
    <div className="relative border border-line bg-band">
      {label && <div className="border-b border-line px-4 py-2 font-mono text-[12px] text-mute">{label}</div>}
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-[13px] leading-[1.6] text-ink"><code>{shown ?? code}</code></pre>
      <button onClick={copy} className="absolute right-2 top-2 bg-[#e5e5e5] px-2.5 py-1 text-[12px] transition-colors duration-150 hover:bg-[#d9d9d9] active:scale-[.98]" style={label ? { top: 38 } : undefined}>
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
