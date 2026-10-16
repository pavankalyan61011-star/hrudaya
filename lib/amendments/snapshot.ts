/**
 * The canonical record an amendment works on (Week 6 spec §3). Built from the loader's rows
 * (lib/fhir/load.ts → getProcedureFull), and identical to the SQL function
 * public.procedure_snapshot (migration 0010) for the same record — a seeded test checks every case.
 *
 * Same rules as the SQL:
 *  - no row ids, foreign keys, audit columns or review fields, and nothing an amendment cannot
 *    change (case code, procedure date, patient);
 *  - interventions carry their lesion as {vessel, segment} instead of vessel_finding_id, with their
 *    devices nested;
 *  - children sorted by explicit natural-key tuples: text compared by code unit (≈ collate "C"),
 *    numbers numerically, false before true, null first.
 * Two snapshots of an unchanged record serialise byte-identically (canonicalJson sorts keys).
 *
 * Type-only imports plus relative `.ts` imports, so it runs under Node as well as in Next.
 */
import type { FhirSource } from "../fhir/load.ts";

type Row = Record<string, unknown>;
export type Snapshot = {
  procedure: Row;
  vessel_findings: Row[];
  interventions: Row[];
  procedure_medications: Row[];
  complications: Row[];
  discharge: Row | null;
};

const AUDIT = ["created_at", "updated_at", "created_by"];
const PROCEDURE_EXCLUDED = [
  "id", "patient_id", "case_code", "procedure_date", "status", ...AUDIT, "reviewed_by", "reviewed_at", "reviewing_clinician_id",
];
/** Keys the loader adds to the procedure row by embedding other tables. */
const PROCEDURE_EMBEDS = [
  "patient", "operator", "reviewer", "consent_by", "timeout_by", "facility",
  "vessel_findings", "interventions", "procedure_medications", "complications", "discharge",
];

function omit(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!keys.includes(k)) out[k] = v;
  return out;
}

/** Compare like the SQL ORDER BY: null first; numbers numerically; booleans false < true; text by code unit. */
function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function sortBy<T>(rows: T[], key: (r: T) => unknown[]): T[] {
  return [...rows].sort((x, y) => {
    const kx = key(x), ky = key(y);
    for (let i = 0; i < kx.length; i++) {
      const c = cmp(kx[i], ky[i]);
      if (c) return c;
    }
    return 0;
  });
}

const v = (r: Row, k: string) => r[k] ?? null;

export function snapshotProcedure(p: FhirSource): Snapshot {
  const raw = p as unknown as Row;
  const vessels = (raw.vessel_findings as Row[]) ?? [];
  const byId = new Map(vessels.map((x) => [x.id as string, x]));

  const vessel_findings = sortBy(vessels.map((x) => omit(x, ["id", "procedure_id", ...AUDIT])), (r) => [
    v(r, "vessel"), v(r, "segment"), v(r, "stenosis_pct"), v(r, "timi_flow"), v(r, "is_culprit"), v(r, "lesion_length_mm"),
    v(r, "calcification"), v(r, "thrombus"), v(r, "bifurcation"), v(r, "lesion_notes"),
  ]);

  const interventions = sortBy(
    ((raw.interventions as Row[]) ?? []).map((i) => {
      const lesion = byId.get(i.vessel_finding_id as string);
      const devices = sortBy(((i.devices_used as Row[]) ?? []).map((d) => omit(d, ["id", "intervention_id", ...AUDIT])), (d) => [
        v(d, "phase"), v(d, "category"), v(d, "product_name"), v(d, "diameter_mm"), v(d, "length_mm"), v(d, "inflation_atm"),
        v(d, "lot_number"), v(d, "expiry_date"), v(d, "udi"), v(d, "manufacturer"), v(d, "quantity"),
      ]);
      return {
        ...omit(i, ["id", "procedure_id", "vessel_finding_id", ...AUDIT, "devices_used"]),
        lesion: { vessel: lesion?.vessel ?? null, segment: lesion?.segment ?? null },
        devices,
      } as Row;
    }),
    (r) => {
      const l = r.lesion as Row;
      return [l.vessel, l.segment, v(r, "intervention_type"), v(r, "residual_stenosis_pct"), v(r, "timi_flow_post"), v(r, "guidewire"), v(r, "notes")];
    },
  );

  const procedure_medications = sortBy(((raw.procedure_medications as Row[]) ?? []).map((m) => omit(m, ["id", "procedure_id", ...AUDIT])), (r) => [
    v(r, "timing"), v(r, "drug_name"), v(r, "administered_at"), v(r, "dose"), v(r, "dose_unit"), v(r, "route"), v(r, "act_seconds"),
    v(r, "act_measured_at"), v(r, "notes"),
  ]);

  const complications = sortBy(((raw.complications as Row[]) ?? []).map((c) => omit(c, ["id", "procedure_id", ...AUDIT])), (r) => [
    v(r, "complication"), v(r, "onset"), v(r, "onset_at"), v(r, "severity"), v(r, "management"), v(r, "outcome"),
  ]);

  const d = raw.discharge as Row | null;
  const discharge = d
    ? ({
        ...omit(d, ["id", "procedure_id", ...AUDIT, "discharge_medications"]),
        medications: sortBy(((d.discharge_medications as Row[]) ?? []).map((m) => omit(m, ["id", "discharge_id", ...AUDIT])), (r) => [
          v(r, "drug_name"), v(r, "dose"), v(r, "dose_unit"), v(r, "frequency"), v(r, "route"), v(r, "duration"), v(r, "purpose"), v(r, "is_dapt"),
        ]),
      } as Row)
    : null;

  return {
    procedure: omit(raw, [...PROCEDURE_EXCLUDED, ...PROCEDURE_EMBEDS]),
    vessel_findings,
    interventions,
    procedure_medications,
    complications,
    discharge,
  };
}

/** JSON with keys sorted at every level: equal values give byte-identical text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const k of Object.keys(value as Row).sort()) out[k] = sortKeys((value as Row)[k]);
    return out;
  }
  return value;
}
