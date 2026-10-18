/**
 * The PHI-minimal input sent to the model for a patient discharge summary (Week 4 spec §4).
 *
 * Pure and deterministic: record in, object out, keys in a fixed order — so `inputHash` is stable.
 * Included is exactly the §4 table, plus each complication's outcome and management text (owner,
 * 2026-10-15; the only free text sent, ≤ 300 chars each). Never included: patient name, date of
 * birth, MRN, ABHA, phone; lesion notes and all other free text; device lot, expiry and UDI.
 * A null field is omitted — never sent as null or "Not recorded".
 *
 * Week 7 (prompt v7): a lesion's physiology (index, value, defer/treat) and intravascular imaging
 * (modality, final stent result), and the in-hospital outcomes recorded as "yes". Never sent: STEMI
 * times, BARC grade, creatinine, the other Week 7 detail. These keys appear only when the record
 * has the data, so a case without Week 7 data keeps its Week 6 input and hash.
 *
 * v8: no sheath size (French gauge) and no device other than stents and balloons (a guidewire or
 * catheter is never sent); a lesion inside an earlier stent says so. A row generated with an
 * earlier prompt keeps the hash of the input it was generated from (`inputHashFor`), so this
 * change alone never marks an approved summary "record changed".
 *
 * Type-only imports plus relative `.ts` imports, so it runs unchanged in Next and under Node.
 */
import { createHash } from "node:crypto";
import type { FhirSource } from "../fhir/load.ts";
import { lesionName } from "../report-format.ts";
import { usesV7Input } from "./prompt.ts";

type P = FhirSource;

export type SummaryMedication = {
  drug_name: string;
  dose?: number;
  unit?: string;
  frequency: string;
  route: string;
  is_dapt: boolean;
  duration?: string;
};

export type SummaryPhysiology = { test: string; value: number; when: string; decision?: "defer" | "treat" };
export type SummaryImaging = { test: string; when: string; stent_expansion_pct?: number; malapposition?: boolean; edge_dissection?: boolean };

export type SummaryInput = {
  patient: { age_years: number; sex: string };
  episode: {
    case_code: string;
    indication?: string;
    urgency?: string;
    admitted_at?: string;
    discharged_at?: string;
    facility_name?: string;
    cath_lab_name?: string;
  };
  risk_factors: string[];
  /** `sheath_size_fr` only in the v7 builder (rows from prompts v1–v7), for their hash. */
  access?: { site: string; side?: string; sheath_size_fr?: number };
  findings: {
    vessel: string;
    stenosis_pct: number;
    timi_flow: number;
    /** v8: the narrowing is inside a stent from an earlier procedure (in-stent restenosis). */
    inside_earlier_stent?: true;
    /** Week 7: pressure-wire or angiography-derived index; `decision` exactly as recorded. */
    physiology?: SummaryPhysiology[];
    /** Week 7: IVUS/OCT; the stent result only after treatment. */
    imaging?: SummaryImaging[];
  }[];
  interventions: { vessel: string; type: string; residual_stenosis_pct: number; final_timi: number }[];
  devices: { category: string; name: string; size: string }[];
  measurements: { lvef_pct?: number; contrast_ml?: number; fluoroscopy_min?: number };
  /** Only complications whose outcome is recorded (owner, 2026-10-15): described with it, or not at all. */
  complications: { name: string; onset?: string; management?: string; outcome: string }[];
  discharge?: {
    clinical_status?: string;
    follow_up_date?: string;
    follow_up_clinic?: string;
    advice: string[];
    red_flags: string[];
    dapt_planned_months?: number;
    dapt_review_date?: string;
  };
  medications: SummaryMedication[];
  operator?: { name: string; role: string };
  /** Week 7: in-hospital outcomes recorded as "yes" (death excluded), in a fixed order. */
  in_hospital_events?: string[];
};

// ─── Display text (patient-facing English; the model translates the prose, not drug fields) ─────

const INDICATION: Record<string, string> = {
  stemi: "ST-elevation myocardial infarction (STEMI, heart attack)",
  nstemi: "Non-ST-elevation myocardial infarction (NSTEMI, heart attack)",
  unstable_angina: "Unstable angina",
  stable_angina: "Stable angina",
  positive_stress_test: "Abnormal stress test",
  pre_op_assessment: "Assessment before surgery",
  cardiomyopathy_workup: "Investigation of heart muscle disease",
  other: "Other",
};
const RISK: Record<string, string> = {
  hypertension: "High blood pressure", diabetes_t2: "Type 2 diabetes", diabetes_t1: "Type 1 diabetes",
  dyslipidaemia: "High cholesterol", smoking: "Current smoker", ex_smoker: "Former smoker",
  family_history: "Family history of heart disease", ckd: "Chronic kidney disease", obesity: "Obesity",
  prior_pci: "Previous stent procedure (PCI)", prior_cabg: "Previous bypass surgery (CABG)",
  prior_mi: "Previous heart attack", other: "Other",
};
const INTERVENTION: Record<string, string> = {
  pci_des: "Drug-eluting stent", pci_bms: "Bare-metal stent", poba: "Balloon angioplasty",
  drug_coated_balloon: "Drug-coated balloon", thrombectomy: "Clot removal (thrombectomy)",
  rotational_atherectomy: "Rotational atherectomy", other: "Other",
};
const DEVICE: Record<string, string> = {
  stent: "Stent", balloon_sc: "Balloon", balloon_nc: "Balloon", balloon_dcb: "Drug-coated balloon",
  balloon_scoring: "Scoring balloon", guidewire: "Guidewire", other: "Device",
};
const COMPLICATION: Record<string, string> = {
  dissection: "Tear in the artery wall (dissection)", perforation: "Perforation of the artery",
  no_reflow: "Slow blood flow after the stent (no-reflow)", access_site_haematoma: "Bruise or swelling at the access site (haematoma)",
  radial_occlusion: "Blocked wrist artery", contrast_nephropathy: "Kidney strain from contrast",
  arrhythmia: "Irregular heartbeat", cardiac_tamponade: "Fluid around the heart (tamponade)",
  stroke: "Stroke", death: "Death", other: "Other complication",
};
const ONSET: Record<string, string> = { intraprocedural: "during the procedure", inpatient: "after the procedure, in hospital" };
const PHYSIOLOGY_INDEX: Record<string, string> = { ffr: "FFR", ifr: "iFR", rfr: "RFR", dfr: "DFR", pd_pa_rest: "Pd/Pa" };
const IMAGING: Record<string, string> = { ivus: "IVUS", oct: "OCT", nirs_ivus: "NIRS-IVUS" };
const PHASE: Record<string, string> = { pre: "before treatment", post: "after treatment" };
/** Patient-facing names; the order here is the order sent. Death is never sent. */
const OUTCOME_EVENTS: [string, string][] = [
  ["mi", "Heart attack in hospital after the procedure (myocardial infarction)"],
  ["stroke", "Stroke"],
  ["cardiac_tamponade", "Fluid around the heart (tamponade)"],
  ["bleeding", "Bleeding"],
  ["transfusion", "Blood transfusion"],
  ["aki", "Kidney strain (acute kidney injury)"],
  ["new_dialysis", "Dialysis (kidney machine) started"],
  ["emergency_cabg", "Emergency bypass surgery (CABG)"],
  ["unplanned_repeat_pci", "A second, unplanned stent procedure"],
];
const VASCULAR: Record<string, string> = {
  haematoma: "Bruise or swelling at the access site (haematoma)", pseudoaneurysm: "Bulge in the artery at the access site (pseudoaneurysm)",
  av_fistula: "Abnormal connection between artery and vein at the access site (AV fistula)",
  retroperitoneal_bleed: "Bleeding inside the abdomen behind the bowel (retroperitoneal bleed)",
  limb_ischaemia: "Reduced blood supply to the limb", radial_occlusion: "Blocked wrist artery",
  dissection_access_vessel: "Tear in the access artery (dissection)", other: "Other problem at the access site",
};
const URGENCY: Record<string, string> = { elective: "Planned", urgent: "Urgent", emergency: "Emergency" };
const ROLE: Record<string, string> = {
  interventional_cardiologist: "Interventional cardiologist", fellow: "Cardiology fellow",
  cath_lab_technologist: "Cath lab technologist", nurse: "Nurse",
};

/** "OD" etc. — the abbreviations stay in Latin script in every language (spec §5.1). */
const FREQUENCY: Record<string, string> = { od: "OD", bd: "BD", tds: "TDS", qds: "QDS", prn: "PRN", weekly: "Weekly" };

const istDate = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

function ageOn(dob: string, on: string) {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Drops undefined and null values, keeping key order. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")) as T;
}

const sizeText = (d: number, l: number) => `${d} × ${l} mm`;

/**
 * Complication management/outcome are the only free text sent (owner, 2026-10-15): whitespace
 * collapsed, at most 300 characters, empty → undefined.
 */
export const COMPLICATION_TEXT_MAX = 300;
function clip(s: string | null | undefined): string | undefined {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > COMPLICATION_TEXT_MAX ? `${t.slice(0, COMPLICATION_TEXT_MAX - 1)}…` : t;
}

function access(site: string | null, sheath: number | null | undefined): SummaryInput["access"] {
  if (!site) return undefined;
  const [side, ...rest] = site.split("_");
  const known = side === "right" || side === "left";
  const name = known ? rest.join(" ") : site.replace(/_/g, " ");
  return compact({
    site: name.charAt(0).toUpperCase() + name.slice(1),
    side: known ? side.charAt(0).toUpperCase() + side.slice(1) : undefined,
    sheath_size_fr: sheath ?? undefined,
  });
}

type Finding = P["vessel_findings"][number];

function physiology(v: Finding): SummaryPhysiology[] | undefined {
  const rows = [...(v.lesion_physiology ?? [])].sort((a, b) => (a.phase === b.phase ? a.recorded_at.localeCompare(b.recorded_at) : a.phase === "pre" ? -1 : 1));
  if (!rows.length) return undefined;
  return rows.map((r) => compact({ test: PHYSIOLOGY_INDEX[r.index] ?? r.index, value: Number(r.value), when: PHASE[r.phase], decision: r.decision ?? undefined }));
}

function imaging(v: Finding): SummaryImaging[] | undefined {
  const rows = [...(v.intravascular_imaging ?? [])].sort((a, b) => (a.phase === b.phase ? a.recorded_at.localeCompare(b.recorded_at) : a.phase === "pre" ? -1 : 1));
  if (!rows.length) return undefined;
  return rows.map((r) =>
    compact({
      test: IMAGING[r.modality] ?? r.modality,
      when: PHASE[r.phase],
      ...(r.phase === "post"
        ? { stent_expansion_pct: r.stent_expansion_pct ?? undefined, malapposition: r.malapposition ?? undefined, edge_dissection: r.edge_dissection ?? undefined }
        : {}),
    }),
  );
}

function inHospitalEvents(p: P): string[] | undefined {
  const o = p.in_hospital_outcomes;
  if (!o) return undefined;
  const yes = (k: string) => (o as unknown as Record<string, unknown>)[k] === "yes";
  const events = [
    ...OUTCOME_EVENTS.filter(([k]) => yes(k)).map(([, text]) => text),
    ...(o.vascular_status === "yes" ? o.vascular_complications.map((c) => VASCULAR[c] ?? c) : []),
  ];
  return events.length ? events : undefined;
}

/** Sent from v8: stents and balloons only — a guidewire or "other" device (e.g. a catheter) never is. */
const PATIENT_DEVICES = new Set(["stent", "balloon_sc", "balloon_nc", "balloon_dcb", "balloon_scoring"]);

/**
 * `builder: "v7"` rebuilds the input exactly as prompts v1–v7 received it (sheath size, every
 * device, no in-stent flag) — only to check those rows' hashes. Never sent to the model.
 */
export function buildSummaryInput(p: P, builder: "current" | "v7" = "current"): SummaryInput {
  const v7 = builder === "v7";
  const vessels = new Map(p.vessel_findings.map((v) => [v.id, v]));
  const onDate = p.procedure_date ?? p.patient.date_of_birth;
  const d = p.discharge;

  const input: SummaryInput = {
    patient: { age_years: ageOn(p.patient.date_of_birth, onDate), sex: p.patient.sex },
    episode: compact({
      case_code: p.case_code,
      indication: p.indication ? INDICATION[p.indication] : undefined,
      urgency: p.urgency ? URGENCY[p.urgency] : undefined,
      admitted_at: p.admitted_at ? istDate(p.admitted_at) : undefined,
      discharged_at: d ? istDate(d.discharged_at) : undefined,
      facility_name: p.facility?.name,
      cath_lab_name: p.facility?.cath_lab_name,
    }),
    risk_factors: p.patient.risk_factors.map((r) => RISK[r.factor] ?? r.factor),
    access: access(p.access_site, v7 ? p.sheath_size_fr : undefined),
    findings: p.vessel_findings.map((v) =>
      compact({
        vessel: lesionName(v.vessel, v.segment),
        stenosis_pct: v.stenosis_pct,
        timi_flow: v.timi_flow,
        inside_earlier_stent: !v7 && v.in_stent_restenosis ? (true as const) : undefined,
        physiology: physiology(v),
        imaging: imaging(v),
      }),
    ),
    interventions: p.interventions.map((i) => {
      const v = vessels.get(i.vessel_finding_id);
      return {
        vessel: v ? lesionName(v.vessel, v.segment) : "Treated lesion",
        type: INTERVENTION[i.intervention_type] ?? i.intervention_type,
        residual_stenosis_pct: i.residual_stenosis_pct,
        final_timi: i.timi_flow_post,
      };
    }),
    devices: p.interventions.flatMap((i) =>
      i.devices_used.filter((dev) => v7 || PATIENT_DEVICES.has(dev.category)).map((dev) => ({ category: DEVICE[dev.category] ?? dev.category, name: dev.product_name, size: sizeText(dev.diameter_mm, dev.length_mm) })),
    ),
    measurements: compact({
      // Three-state rule: only a recorded LVEF is sent; otherwise the key is absent.
      lvef_pct: p.lvef_status === "recorded" && p.lvef_pct !== null ? p.lvef_pct : undefined,
      contrast_ml: p.contrast_volume_ml ?? undefined,
      fluoroscopy_min: p.fluoroscopy_time_min ?? undefined,
    }),
    complications: p.complications
      .filter((c) => clip(c.outcome))
      .map((c) =>
        compact({
          name: COMPLICATION[c.complication] ?? c.complication,
          onset: c.onset ? ONSET[c.onset] : undefined,
          management: clip(c.management),
          outcome: clip(c.outcome)!,
        }),
      ),
    discharge: d
      ? compact({
          clinical_status: d.clinical_status,
          follow_up_date: d.follow_up_date,
          follow_up_clinic: d.follow_up_clinic,
          advice: [...d.advice],
          red_flags: [...d.red_flags],
          dapt_planned_months: d.dapt_planned_months ?? undefined,
          dapt_review_date: d.dapt_review_date ?? undefined,
        })
      : undefined,
    medications: (d?.discharge_medications ?? []).map((m) =>
      compact({
        drug_name: m.drug_name,
        dose: m.dose ?? undefined,
        unit: m.dose_unit ?? undefined,
        frequency: FREQUENCY[m.frequency] ?? m.frequency,
        route: m.route,
        is_dapt: m.is_dapt,
        duration: m.duration ?? undefined,
      }),
    ),
    operator: p.operator ? { name: p.operator.full_name, role: ROLE[p.operator.role] ?? p.operator.role } : undefined,
    in_hospital_events: inHospitalEvents(p),
  };
  return compact(input);
}

/** sha256 of the canonical JSON — stored on every row; a changed record changes the hash. */
export function inputHash(input: SummaryInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** The hash a row generated with `promptVersion` must carry while its record is unchanged. */
export function inputHashFor(p: P, promptVersion: string): string {
  return inputHash(buildSummaryInput(p, usesV7Input(promptVersion) ? "v7" : "current"));
}
