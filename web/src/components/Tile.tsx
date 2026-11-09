import { useId } from "react";

export type Glyph = "shield" | "calendar" | "bars" | "peak" | "book" | "search";
export type TileDef = { id: string; label: string; color: string; side: string; glyph: Glyph };

/** A glossy isometric tile: extruded side, rounded top face, soft shadow, drawn glyph. 111 x 78 box, top-face centre (55.5, 31). */
export function Tile({ def }: { def: TileDef }) {
  const uid = useId();
  const top = "55.5,8 98,31 55.5,54 13,31";
  return (
    <svg width="111" height="78" viewBox="0 0 111 78" overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
        <filter id={`${uid}s`} x="-30%" y="-30%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <ellipse cx="55.5" cy="58" rx="42" ry="13" fill="#000" opacity=".22" filter={`url(#${uid}s)`} />
      <polygon points={top} transform="translate(0 11)" fill={def.side} stroke={def.side} strokeWidth="14" strokeLinejoin="round" />
      <polygon points={top} fill={def.color} stroke={def.color} strokeWidth="14" strokeLinejoin="round" />
      <polygon points={top} fill={`url(#${uid}g)`} stroke={`url(#${uid}g)`} strokeWidth="14" strokeLinejoin="round" />
      <g transform="translate(55.5 31) scale(1 .5) rotate(45)">
        <GlyphPath glyph={def.glyph} bg={def.color} grad={`url(#${uid}b)`} />
      </g>
    </svg>
  );
}

function GlyphPath({ glyph, bg, grad }: { glyph: Glyph; bg: string; grad: string }) {
  const W = "#fff";
  switch (glyph) {
    case "shield":
      return (<g><path d="M0 -13 L11 -8 V1 C11 8 6 12 0 14 C-6 12 -11 8 -11 1 V-8 Z" fill={W} /><path d="M-5 1 L-1 5 L6 -4" fill="none" stroke={bg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>);
    case "calendar":
      return (<g><rect x="-12" y="-11" width="24" height="23" rx="3.5" fill={W} /><rect x="-12" y="-11" width="24" height="7" rx="3.5" fill={W} /><path d="M-12 -4H12" stroke={bg} strokeWidth="2" />{[-6, 0, 6].flatMap((x) => [2, 7].map((y) => <rect key={`${x}${y}`} x={x - 2} y={y - 1.5} width="4" height="3" rx="1" fill={bg} />))}</g>);
    case "bars":
      return (<g fill={grad}><polygon points="-13,-9 -7,-9 -4,11 -10,11" /><polygon points="-3,-12 3,-12 6,11 0,11" /><polygon points="7,-9 13,-9 16,11 10,11" /></g>);
    case "peak":
      return <path d="M-14 11 L-4 -9 L3 3 L7 -3 L15 11 Z" fill={W} />;
    case "book":
      return (<g fill={W}><path d="M-13 -9 H-1.5 V11 H-13 Z" /><path d="M1.5 -9 H13 V11 H1.5 Z" /></g>);
    case "search":
      return (<g fill="none" stroke={W} strokeWidth="3.4" strokeLinecap="round"><circle cx="-2" cy="-2" r="8" /><path d="M4 4 L11 11" /></g>);
  }
}
