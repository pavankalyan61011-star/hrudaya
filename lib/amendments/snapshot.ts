/**
 * The canonical record an amendment works on (Week 6 spec §3). Built from the loader's rows
 * (lib/fhir/load.ts → getProcedureFull), and identical to the SQL function
 * public.procedure_snapshot (migration 0010) for the same record — a seeded test checks every case.
 *
 * Same rules as the SQL:
 *  - no row ids, foreign keys, audit columns or review fields, and nothing an amendment cannot
 *    change (case code, procedure date, patient);
 *  - interventions carry their lesion as {vessel, segment} instead of vessel_finding_id, with their
 *    devices (and each device's inflation log) nested;
 *  - Week 7 (0011): a lesion carries its physiology and imaging rows, and its graft as
 *    {graft_type, target_vessel} instead of graft_id; grafts, haemodynamics, LV wall motion and
 *    in-hospital outcomes are top-level, the outcomes' event_links replaced by the linked events'
 *    {complication, onset_at}; recorded_by / recorded_at are left out like audit columns;
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
  grafts: Row[];
  haemodynamics: Row | null;
  lv_wall_motion: Row[];
  in_hospital_outcomes: Row | null;
};

const AUDIT = ["created_at", "updated_at", "created_by"];
const RECORDED = ["recorded_by", "recorded_at"];
const PROCEDURE_EXCLUDED = [
  "id", "patient_id", "case_code", "procedure_date", "status", ...AUDIT, "reviewed_by", "reviewed_at", "reviewing_clinician_id",
];
/** Keys the loader adds to the procedure row by embedding other tables. */
const PROCEDURE_EMBEDS = [
  "patient", "operator", "reviewer", "consent_by", "timeout_by", "facility",
  "vessel_findings", "interventions", "procedure_medications", "complications", "discharge", "amendments",
  "grafts", "haemodynamics", "lv_wall_motion", "in_hospital_outcomes",
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
/** An array column in a sort key, as SQL's array_to_string(…, ','). */
const joined = (r: Row, k: string) => ((r[k] as unknown[]) ?? []).join(",");

export function snapshotProcedure(p: FhirSource): Snapshot {
  const raw = p as unknown as Row;
  const vessels = (raw.vessel_findings as Row[]) ?? [];
  const byId = new Map(vessels.map((x) => [x.id as string, x]));

  const grafts = (raw.grafts as Row[]) ?? [];
  const graftById = new Map(grafts.map((g) => [g.id as string, g]));

  const vessel_findings = sortBy(
    vessels.map((x) => {
      const graft = x.graft_id ? graftById.get(x.graft_id as string) : undefined;
      return {
        ...omit(x, ["id", "procedure_id", ...AUDIT, "graft_id", "lesion_physiology", "intravascular_imaging"]),
        graft: graft ? { graft_type: graft.graft_type, target_vessel: graft.target_vessel } : null,
        physiology: sortBy(((x.lesion_physiology as Row[]) ?? []).map((r) => omit(r, ["id", "vessel_finding_id", ...RECORDED])), (r) => [
          v(r, "phase"), v(r, "index"), v(r, "value"), v(r, "hyperaemic_agent"), v(r, "agent_dose"), v(r, "decision"), v(r, "method"),
          v(r, "image_study_uid"), v(r, "image_series_uid"), v(r, "source"), v(r, "notes"),
        ]),
        imaging: sortBy(((x.intravascular_imaging as Row[]) ?? []).map((r) => omit(r, ["id", "vessel_finding_id", ...RECORDED])), (r) => [
          v(r, "modality"), v(r, "phase"), v(r, "mla_mm2"), v(r, "eem_area_mm2"), v(r, "plaque_burden_pct"), v(r, "calcium_arc_deg"),
          v(r, "calcium_thickness_mm"), v(r, "lipid_arc_deg"), v(r, "max_lcbi_4mm"), v(r, "msa_mm2"), v(r, "stent_expansion_pct"),
          v(r, "malapposition"), v(r, "edge_dissection"), v(r, "pullback_length_mm"), v(r, "image_study_uid"), v(r, "image_series_uid"),
          v(r, "image_instance_uid"), v(r, "mla_frame"), v(r, "method"), v(r, "source"), v(r, "notes"),
        ]),
      } as Row;
    }),
    (r) => [
      v(r, "vessel"), v(r, "segment"), v(r, "stenosis_pct"), v(r, "timi_flow"), v(r, "is_culprit"), v(r, "lesion_length_mm"),
      v(r, "calcification"), v(r, "thrombus"), v(r, "bifurcation"), v(r, "lesion_notes"),
      v(r, "lesion_class"), v(r, "ostial"), v(r, "bifurcation_medina"), v(r, "tortuosity"), v(r, "cto"), v(r, "cto_duration_months"),
      v(r, "in_stent_restenosis"), v(r, "isr_pattern"), v(r, "collaterals_rentrop"), v(r, "timi_frame_count"), v(r, "stenosis_source"),
      v(r, "mld_mm"), v(r, "rvd_mm"), v(r, "measurement_method"), v(r, "image_study_uid"), v(r, "image_series_uid"),
      v(r, "image_instance_uid"), v(r, "image_frame"), v(r, "image_view"),
    ],
  );

  const interventions = sortBy(
    ((raw.interventions as Row[]) ?? []).map((i) => {
      const lesion = byId.get(i.vessel_finding_id as string);
      const devices = sortBy(((i.devices_used as Row[]) ?? []).map((d) => ({
        ...omit(d, ["id", "intervention_id", ...AUDIT, "device_inflations"]),
        inflations: sortBy(((d.device_inflations as Row[]) ?? []).map((f) => omit(f, ["id", "device_id", ...RECORDED])), (f) => [
          v(f, "sequence"), v(f, "pressure_atm"), v(f, "duration_s"), v(f, "source"), v(f, "notes"),
        ]),
      } as Row)), (d) => [
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
      return [
        l.vessel, l.segment, v(r, "intervention_type"), v(r, "residual_stenosis_pct"), v(r, "timi_flow_post"), v(r, "guidewire"), v(r, "notes"),
        v(r, "success"), v(r, "dissection"), v(r, "perforation"), joined(r, "techniques"), v(r, "technique_other"),
        v(r, "bifurcation_strategy"), v(r, "bifurcation_strategy_other"), v(r, "guiding_catheter"), joined(r, "wires"),
        v(r, "dissection_grade"), v(r, "perforation_class"), v(r, "no_reflow"), v(r, "failure_reason"), v(r, "stent_overlap"),
        v(r, "total_stent_length_mm"),
      ];
    },
  );

  const procedure_medications = sortBy(((raw.procedure_medications as Row[]) ?? []).map((m) => omit(m, ["id", "procedure_id", ...AUDIT])), (r) => [
    v(r, "timing"), v(r, "drug_name"), v(r, "administered_at"), v(r, "dose"), v(r, "dose_unit"), v(r, "route"), v(r, "act_seconds"),
    v(r, "act_measured_at"), v(r, "notes"),
  ]);

  const complications = sortBy(((raw.complications as Row[]) ?? []).map((c) => omit(c, ["id", "procedure_id", ...AUDIT])), (r) => [
    v(r, "complication"), v(r, "onset"), v(r, "onset_at"), v(r, "severity"), v(r, "management"), v(r, "outcome"),
    v(r, "grade"), joined(r, "treatments"), v(r, "treatment_other"), v(r, "resolution"),
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

  const h = raw.haemodynamics as Row | null;
  const o = raw.in_hospital_outcomes as Row | null;
  const events = new Map(((raw.complications as Row[]) ?? []).map((c) => [c.id as string, c]));

  return {
    procedure: omit(raw, [...PROCEDURE_EXCLUDED, ...PROCEDURE_EMBEDS]),
    vessel_findings,
    interventions,
    procedure_medications,
    complications,
    discharge,
    grafts: sortBy(grafts.map((g) => omit(g, ["id", "procedure_id", ...RECORDED])), (r) => [
      v(r, "graft_type"), v(r, "target_vessel"), v(r, "sequential"), v(r, "patency"), v(r, "stenosis_pct"), v(r, "lesion_location"),
      v(r, "cabg_year"), v(r, "source"), v(r, "notes"),
    ]),
    haemodynamics: h ? omit(h, ["id", "procedure_id", ...RECORDED]) : null,
    lv_wall_motion: sortBy(((raw.lv_wall_motion as Row[]) ?? []).map((w) => omit(w, ["id", "procedure_id", ...RECORDED])), (r) => [
      v(r, "segment"), v(r, "motion"), v(r, "source"), v(r, "notes"),
    ]),
    in_hospital_outcomes: o
      ? {
          ...omit(o, ["id", "procedure_id", ...RECORDED, "event_links"]),
          linked_events: sortBy(
            ((o.event_links as string[]) ?? []).flatMap((id) => {
              const c = events.get(id);
              return c ? [{ complication: c.complication, onset_at: v(c, "onset_at") } as Row] : [];
            }),
            (r) => [v(r, "complication"), v(r, "onset_at")],
          ),
        }
      : null,
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
