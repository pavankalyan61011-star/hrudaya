"use client";

/**
 * AHA 17-segment bullseye (spec §3.3). Anterior at the top, septum on the left, lateral on the
 * right. Tapping a segment cycles normal → hypokinetic → akinetic → dyskinetic → aneurysmal → normal.
 * Each segment is a focusable button (Enter / Space) named with its number, name and state. Shades
 * of grey to ink, with a letter, so the state never depends on colour alone; red is not used.
 */

export type Motion = "hypokinetic" | "akinetic" | "dyskinetic" | "aneurysmal";
const CYCLE: (Motion | null)[] = [null, "hypokinetic", "akinetic", "dyskinetic", "aneurysmal"];
const FILL: Record<Motion, string> = { hypokinetic: "#cbd5e1", akinetic: "#64748b", dyskinetic: "#334155", aneurysmal: "#1A232B" };
const MARK: Record<Motion, string> = { hypokinetic: "H", akinetic: "A", dyskinetic: "D", aneurysmal: "An" };

export const SEGMENT_NAMES: Record<number, string> = {
  1: "basal anterior", 2: "basal anteroseptal", 3: "basal inferoseptal", 4: "basal inferior", 5: "basal inferolateral", 6: "basal anterolateral",
  7: "mid anterior", 8: "mid anteroseptal", 9: "mid inferoseptal", 10: "mid inferior", 11: "mid inferolateral", 12: "mid anterolateral",
  13: "apical anterior", 14: "apical septal", 15: "apical inferior", 16: "apical lateral", 17: "apex",
};

const C = 100;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, deg: number) => `${(C + r * Math.cos(rad(deg))).toFixed(2)} ${(C - r * Math.sin(rad(deg))).toFixed(2)}`;
/** An annular sector from angle a0 to a1 (degrees, counter-clockwise from 3 o'clock). */
function sector(r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 ${large} 0 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 ${large} 1 ${pt(r0, a0)} Z`;
}

// Ring segments: [segment, inner r, outer r, start°, end°]. Basal and mid: anterior centred at 90°,
// then anteroseptal, inferoseptal, inferior, inferolateral, anterolateral going counter-clockwise.
const RINGS: [number, number, number, number, number][] = [
  ...[0, 1, 2, 3, 4, 5].map((i): [number, number, number, number, number] => [1 + i, 70, 96, 60 + i * 60, 120 + i * 60]),
  ...[0, 1, 2, 3, 4, 5].map((i): [number, number, number, number, number] => [7 + i, 44, 70, 60 + i * 60, 120 + i * 60]),
  ...[0, 1, 2, 3].map((i): [number, number, number, number, number] => [13 + i, 20, 44, 45 + i * 90, 135 + i * 90]),
];

export function Bullseye({ value, onChange }: { value: Record<number, Motion>; onChange: (next: Record<number, Motion>) => void }) {
  const cycle = (seg: number) => {
    const now = value[seg] ?? null;
    const next = CYCLE[(CYCLE.indexOf(now) + 1) % CYCLE.length];
    const copy = { ...value };
    if (next) copy[seg] = next;
    else delete copy[seg];
    onChange(copy);
  };
  const seg = (n: number, d: string, labelAt: string) => {
    const m = value[n];
    const [lx, ly] = labelAt.split(" ").map(Number);
    return (
      <g
        key={n}
        role="button"
        tabIndex={0}
        aria-label={`Segment ${n}, ${SEGMENT_NAMES[n]}: ${m ?? "normal"}`}
        onClick={() => cycle(n)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            cycle(n);
          }
        }}
        className="cursor-pointer outline-none [&:focus-visible>path]:stroke-sky-600 [&:focus-visible>path]:stroke-[3]"
      >
        <path d={d} fill={m ? FILL[m] : "#ffffff"} stroke="#94a3b8" strokeWidth="1" />
        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="8" fill={m && m !== "hypokinetic" ? "#ffffff" : "#334155"} pointerEvents="none">
          {n}
          {m ? ` ${MARK[m]}` : ""}
        </text>
      </g>
    );
  };
  return (
    <div>
      <svg viewBox="0 0 200 200" className="mx-auto h-72 w-72 max-w-full touch-manipulation">
        {RINGS.map(([n, r0, r1, a0, a1]) => seg(n, sector(r0, r1, a0, a1), pt((r0 + r1) / 2, (a0 + a1) / 2)))}
        {seg(17, `M ${C - 20} ${C} A 20 20 0 1 0 ${C + 20} ${C} A 20 20 0 1 0 ${C - 20} ${C} Z`, `${C} ${C}`)}
      </svg>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="Legend">
        <li><span className="mr-1 inline-block h-3 w-3 border border-slate-400 bg-white align-middle" />Normal</li>
        {(Object.keys(FILL) as Motion[]).map((m) => (
          <li key={m}>
            <span className="mr-1 inline-block h-3 w-3 border border-slate-400 align-middle" style={{ background: FILL[m] }} />
            {MARK[m]} = {m}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-center text-xs text-slate-500">Tap a segment to cycle normal → hypo → akinetic → dyskinetic → aneurysmal.</p>
    </div>
  );
}
