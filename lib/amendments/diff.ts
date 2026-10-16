/**
 * What an amendment changed (Week 6 spec §3): snapshot at unlock ⇄ snapshot now → field-level
 * changes. Arrays are matched by natural key, never by position, so re-saving a step (which gives
 * child rows new ids and order) is not a change. Labels come from the report's own label tables.
 *
 *   Change = { path, label, before, after, kind: 'changed' | 'added' | 'removed' }
 *
 * The SQL function close_amendment refuses a list that is empty while the record changed, or
 * non-empty while it did not, so this list and the database can't disagree about *whether*
 * anything changed; the server also recomputes the list before storing it.
 *
 * Type-only imports plus relative `.ts` imports, so it runs under Node as well as in Next.
 */
import type { Snapshot } from "./snapshot.ts";
import { label } from "../labels.ts";
import { lesionName } from "../report-format.ts";

type Row = Record<string, unknown>;
export type ChangeKind = "changed" | "added" | "removed";
export type Change = { path: string; label: string; before: unknown; after: unknown; kind: ChangeKind };

/** Field names that read better spelled out than humanised. */
const FIELD: Record<string, string> = {
  dose_unit: "dose unit", is_dapt: "DAPT", lvef_pct: "LVEF %", lvedp_mmhg: "LVEDP (mmHg)", timi_flow: "TIMI flow",
  timi_flow_post: "final TIMI flow", stenosis_pct: "stenosis %", residual_stenosis_pct: "residual stenosis %",
  sheath_size_fr: "sheath size (Fr)", contrast_volume_ml: "contrast volume (mL)", fluoroscopy_time_min: "fluoroscopy (min)",
  air_kerma_mgy: "air kerma (mGy)", dap_gy_cm2: "dose-area product (Gy·cm²)", egfr: "eGFR", udi: "UDI",
  diameter_mm: "diameter (mm)", length_mm: "length (mm)", inflation_atm: "inflation (atm)", lesion_length_mm: "lesion length (mm)",
  act_seconds: "ACT (s)", red_flags: "red flag", advice: "advice", dapt_planned_months: "DAPT planned (months)",
  ecg_findings: "ECG", creatinine_umol_l: "creatinine (µmol/L)", haemoglobin_g_dl: "haemoglobin (g/dL)",
  platelets_x10e9_l: "platelets (×10⁹/L)", primary_operator_id: "primary operator", facility_id: "facility",
  consent_by_operator_id: "consent taken by", timeout_by_operator_id: "time-out by",
};
const field = (k: string) => FIELD[k] ?? label(k).toLowerCase();

const isObj = (x: unknown): x is Row => !!x && typeof x === "object" && !Array.isArray(x);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function norm(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(norm);
  if (isObj(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])]));
  return x === undefined ? null : x;
}

/** Field-by-field changes between two rows; nested arrays/objects in `skip` are diffed separately. */
function fieldChanges(path: string, title: string, before: Row, after: Row, skip: string[] = []): Change[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !skip.includes(k)).sort();
  return keys
    .filter((k) => !same(before[k], after[k]))
    .map((k) => ({ path: `${path}.${k}`, label: `${title} · ${field(k)}`, before: before[k] ?? null, after: after[k] ?? null, kind: "changed" as const }));
}

/**
 * Match two arrays of rows by natural key (pairs with equal keys in order), then report each pair's
 * field changes and every unmatched row as added/removed.
 */
function matched(
  path: string, before: Row[], after: Row[], key: (r: Row) => string, title: (r: Row) => string,
  inner: (path: string, title: string, b: Row, a: Row) => Change[],
): Change[] {
  const out: Change[] = [];
  const pool = new Map<string, Row[]>();
  for (const a of after) pool.set(key(a), [...(pool.get(key(a)) ?? []), a]);
  for (const b of before) {
    const k = key(b);
    const list = pool.get(k);
    const a = list?.shift();
    if (!a) {
      out.push({ path: `${path}[${k}]`, label: `${title(b)} · removed`, before: b, after: null, kind: "removed" });
      continue;
    }
    out.push(...inner(`${path}[${k}]`, title(b), b, a));
  }
  for (const [k, rest] of pool) for (const a of rest) out.push({ path: `${path}[${k}]`, label: `${title(a)} · added`, before: null, after: a, kind: "added" });
  return out;
}

/** Text lists (advice, red flags): item-level, order-insensitive, duplicates counted. */
function listChanges(path: string, title: string, before: unknown, after: unknown): Change[] {
  const b = Array.isArray(before) ? (before as unknown[]).map(String) : [];
  const a = Array.isArray(after) ? (after as unknown[]).map(String) : [];
  const out: Change[] = [];
  const left = [...a];
  for (const item of b) {
    const i = left.indexOf(item);
    if (i >= 0) left.splice(i, 1);
    else out.push({ path: `${path}[${item}]`, label: `${title} removed`, before: item, after: null, kind: "removed" });
  }
  for (const item of left) out.push({ path: `${path}[${item}]`, label: `${title} added`, before: null, after: item, kind: "added" });
  // Same items, different order: order matters on a leaflet (group headings), so say so once.
  if (!out.length && !same(b, a)) out.push({ path, label: `${title}s reordered`, before: b, after: a, kind: "changed" });
  return out;
}

const lesion = (r: Row) => {
  const l = (isObj(r.lesion) ? r.lesion : r) as Row;
  return l.vessel ? lesionName(l.vessel as never, (l.segment ?? null) as never) : "Unknown vessel";
};
const size = (d: Row) => `${d.diameter_mm ?? "?"}×${d.length_mm ?? "?"}`;

export function diffSnapshots(before: Snapshot, after: Snapshot): Change[] {
  const out: Change[] = [];

  out.push(...fieldChanges("procedure", "Procedure", before.procedure, after.procedure));

  out.push(...matched("vessel_findings", before.vessel_findings, after.vessel_findings,
    (r) => `${r.vessel}/${r.segment ?? ""}`, (r) => `Vessel finding · ${lesion(r)}`,
    (p, t, b, a) => fieldChanges(p, t, b, a)));

  out.push(...matched("interventions", before.interventions, after.interventions,
    (r) => `${(r.lesion as Row)?.vessel}/${(r.lesion as Row)?.segment ?? ""}/${r.intervention_type}`,
    (r) => `Intervention · ${lesion(r)} · ${label(r.intervention_type as string)}`,
    (p, t, b, a) => [
      ...fieldChanges(p, t, b, a, ["devices", "lesion"]),
      ...matched(`${p}.devices`, (b.devices as Row[]) ?? [], (a.devices as Row[]) ?? [],
        (d) => `${d.phase}/${d.category}/${d.product_name}/${size(d)}`,
        (d) => `Device · ${d.product_name} ${size(d)}`,
        (dp, dt, db, da) => fieldChanges(dp, dt, db, da)),
    ]));

  out.push(...matched("procedure_medications", before.procedure_medications, after.procedure_medications,
    (r) => `${r.timing}/${r.drug_name}`, (r) => `Procedure medication · ${r.drug_name}`,
    (p, t, b, a) => fieldChanges(p, t, b, a)));

  out.push(...matched("complications", before.complications, after.complications,
    (r) => `${r.complication}`, (r) => `Complication · ${label(r.complication as string)}`,
    (p, t, b, a) => fieldChanges(p, t, b, a)));

  const bd = before.discharge, ad = after.discharge;
  if (bd && !ad) out.push({ path: "discharge", label: "Discharge · removed", before: bd, after: null, kind: "removed" });
  else if (!bd && ad) out.push({ path: "discharge", label: "Discharge · added", before: null, after: ad, kind: "added" });
  else if (bd && ad) {
    out.push(...fieldChanges("discharge", "Discharge", bd, ad, ["medications", "advice", "red_flags"]));
    out.push(...listChanges("discharge.advice", "Discharge · advice", bd.advice, ad.advice));
    out.push(...listChanges("discharge.red_flags", "Discharge · red flag", bd.red_flags, ad.red_flags));
    out.push(...matched("discharge.medications", (bd.medications as Row[]) ?? [], (ad.medications as Row[]) ?? [],
      (r) => `${r.drug_name}`, (r) => `Discharge medication · ${r.drug_name}`,
      (p, t, b, a) => fieldChanges(p, t, b, a)));
  }
  return out;
}
