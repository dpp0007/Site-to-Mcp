/** The Wicket mark: a tall gate (the web, locked) with a small door set into it (the way in for an agent). */
export function Gate({ size = 24, door = "#2fc08d", className }: { size?: number; door?: string; className?: string }) {
  return (
    <svg width={size} height={size * (26 / 24)} viewBox="0 0 24 26" fill="none" aria-hidden="true" className={className}>
      <path d="M3 25V10a9 9 0 0 1 18 0v15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 25v-7a2.5 2.5 0 0 1 5 0v7z" fill={door} />
    </svg>
  );
}

/** Logo tile: the gate in white on near-black. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-grid place-items-center bg-ink-2 text-page" style={{ width: size, height: size, borderRadius: size * 0.27 }} aria-hidden="true">
      <Gate size={size * 0.58} />
    </span>
  );
}
