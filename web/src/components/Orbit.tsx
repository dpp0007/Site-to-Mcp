import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useFit, useMedia } from "../lib/hooks";
import { Gate } from "./Mark";
import { Tile, type TileDef } from "./Tile";

/* Everything below is in SOURCE PIXELS of the 1896 x 1080 reference frame; the stage is scaled as one unit. */
const HUB = { x: 1437, y: 866 };
const RATIO = 0.575;            // ellipse height / width, fitted from the tile arc (a=775, b=446)
const FIRST_STEP = 1.75;        // s: first carousel step (measured 1.75 / 5.8 / 9.8)
const PERIOD = 4.02;            // s between steps
const MOVE = { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const };   // measured: ~0.3-0.4 s, ease-in-out
const FAST = { duration: 0.15, ease: [0.4, 0, 0.2, 1] as const };

const TILES: TileDef[] = [
  { id: "access", label: "Site access", color: "#0f0f0f", side: "#000000", glyph: "shield" },
  { id: "events", label: "Events", color: "#5b45f0", side: "#3a28c0", glyph: "calendar" },
  { id: "extract", label: "Extract", color: "#2d2e2e", side: "#151616", glyph: "bars" },
  { id: "parks", label: "Parks", color: "#ed4e6e", side: "#b43455", glyph: "peak" },
  { id: "courses", label: "Courses", color: "#4d5a78", side: "#323c55", glyph: "book" },
  { id: "search", label: "Search", color: "#74c043", side: "#4d8f26", glyph: "search" },
];
const N = TILES.length;

// slot 0 = lead, 1-3 = on the arc, 4 = waiting off-frame right, 5 = just exited (down-left, fading)
const SLOTS = [
  { x: 888, y: 540, scale: 1, opacity: 1, filter: "saturate(1) brightness(1)" },
  { x: 1143, y: 453, scale: 0.81, opacity: 1, filter: "saturate(.72) brightness(1.1)" },
  { x: 1443, y: 420, scale: 0.74, opacity: 1, filter: "saturate(.72) brightness(1.1)" },
  { x: 1742, y: 456, scale: 0.66, opacity: 1, filter: "saturate(.72) brightness(1.1)" },
  { x: 2060, y: 486, scale: 0.6, opacity: 0, filter: "saturate(.6) brightness(1.1)" },
  { x: 800, y: 608, scale: 0.85, opacity: 0, filter: "saturate(0) brightness(1.5)" },
];

const RX = [150, 260, 345, 455, 600, 775, 960];
const SPOKES = Array.from({ length: 18 }, (_, i) => (i / 18) * Math.PI * 2);
const ell = (a: number, r: number) => [HUB.x + Math.cos(a) * r, HUB.y + Math.sin(a) * r * RATIO] as const;
const COMETS = [2, 4, 6, 8, 10, 12, 14, 16];

function Diagram({ step, still }: { step: number; still: boolean }) {
  const lead = TILES[((0 + step) % N + N) % N];
  return (
    <>
      <svg className="absolute left-0 top-0" width="1896" height="958" viewBox="0 0 1896 958" aria-hidden="true">
        <defs>
          <radialGradient id="fade" cx={HUB.x} cy={HUB.y} r="900" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset=".55" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="m"><rect width="1896" height="958" fill="url(#fade)" /></mask>
        </defs>
        <g mask="url(#m)" fill="none" stroke="#d6eee4" strokeWidth="1">
          {RX.map((rx) => <ellipse key={rx} cx={HUB.x} cy={HUB.y} rx={rx} ry={rx * RATIO} />)}
          {SPOKES.map((a, i) => {
            const [x, y] = ell(a, 1100);
            const nx = -Math.sin(a) * 1.6, ny = Math.cos(a) * 1.6 * RATIO;
            return <g key={i}><line x1={HUB.x + nx} y1={HUB.y + ny} x2={x + nx} y2={y + ny} /><line x1={HUB.x - nx} y1={HUB.y - ny} x2={x - nx} y2={y - ny} /></g>;
          })}
        </g>
        {/* active connection: lead tile -> hub, brighter double line */}
        <g stroke="#2fc08d" strokeWidth="1.2" strokeLinecap="round" opacity=".8">
          <line x1="888" y1="542" x2={HUB.x} y2={HUB.y} transform="translate(-1.6 1.6)" />
          <line x1="888" y1="542" x2={HUB.x} y2={HUB.y} transform="translate(1.6 -1.6)" />
        </g>
        {!still && (
          <g mask="url(#m)" stroke="#8fe3c3" strokeWidth="3" strokeLinecap="round" fill="none">
            {COMETS.map((i, k) => {
              const [x, y] = ell(SPOKES[i], 1000);
              return (
                <motion.line key={i} x1={HUB.x} y1={HUB.y} x2={x} y2={y} pathLength={1} strokeDasharray="0.045 1"
                  initial={{ strokeDashoffset: 0.05 }} animate={{ strokeDashoffset: -1 }}
                  transition={{ duration: 2.6, ease: "linear", repeat: Infinity, delay: (k * 0.37) % 2.6 }} />
              );
            })}
          </g>
        )}
        {!still && (
          <motion.ellipse key={step} cx={HUB.x} cy={HUB.y} rx="600" ry={600 * RATIO} fill="none" stroke="#2fc08d" strokeWidth="1.6"
            style={{ transformOrigin: `${HUB.x}px ${HUB.y}px` }}
            initial={{ scale: 0.12, opacity: 0 }} animate={{ scale: 1.25, opacity: [0, 0.55, 0] }}
            transition={{ delay: 1.6, duration: 1.7, ease: "easeOut" }} />
        )}
      </svg>

      {/* hub */}
      <div className="absolute grid place-items-center rounded-[50%] bg-white" style={{ left: HUB.x - 47, top: HUB.y - 28, width: 94, height: 56, boxShadow: "0 10px 34px rgba(0,0,0,.13)" }}>
        <Gate size={25} className="text-ink-2" />
      </div>

      {/* tiles */}
      {TILES.map((def, i) => {
        const k = (((i - step) % N) + N) % N;
        const prev = (((i - step + 1) % N) + N) % N;
        const slot = SLOTS[k];
        const jump = prev === 5 && k === 4;           // waiting tile re-queues off-frame while invisible
        const t = jump ? { duration: 0 } : k === 5 ? { ...MOVE, opacity: FAST } : MOVE;
        return (
          <motion.div key={def.id} className="absolute left-0 top-0" style={{ marginLeft: -55.5, marginTop: -31, zIndex: k === 0 ? 3 : 2 }}
            initial={false} animate={{ x: slot.x, y: slot.y, scale: slot.scale, opacity: slot.opacity, filter: slot.filter }} transition={still ? { duration: 0 } : t}>
            <Tile def={def} />
          </motion.div>
        );
      })}

      {/* label pill: gone while the carousel steps, back once the new lead settles */}
      <AnimatePresence>
        <motion.div key={lead.id} className="absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-white font-sans text-ink"
          style={{ left: 888, top: 466, padding: "5px 12px", fontSize: 15, lineHeight: "20px", boxShadow: "0 2px 10px rgba(0,0,0,.08)", zIndex: 4 }}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: still || step === 0 ? 0 : 0.45, duration: 0.2 }}>
          {lead.label}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default function Orbit() {
  const wide = useMedia("(min-width: 1024px)");
  const reduce = useReducedMotion();
  const [ref, s] = useFit(wide ? 1896 : 1136);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    let iv: number | undefined;
    const first = window.setTimeout(() => {
      setStep((n) => n + 1);
      iv = window.setInterval(() => setStep((n) => n + 1), PERIOD * 1000);
    }, FIRST_STEP * 1000);
    return () => { window.clearTimeout(first); window.clearInterval(iv); };
  }, [reduce]);

  const off = wide ? { x: 0, y: 0 } : { x: 760, y: 380 };
  return (
    <div ref={ref} className={wide ? "absolute inset-0 overflow-hidden" : "relative order-3 mt-10 overflow-hidden"}
      style={wide ? undefined : { height: 578 * s }} aria-hidden="true">
      <div className="absolute left-0 top-0" style={{ width: 1896, height: 1080, transformOrigin: "0 0", transform: `translate(${-off.x * s}px, ${-off.y * s}px) scale(${s})` }}>
        <Diagram step={step} still={!!reduce} />
      </div>
    </div>
  );
}
