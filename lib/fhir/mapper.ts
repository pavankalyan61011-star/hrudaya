/**
 * Hrudaya → FHIR R4 document Bundle (Week 2 spec §3–§4).
 *
 * Pure functions: rows in, resources out. No I/O, no logging, no clock — the caller passes `now`.
 * Every resource id is the database row id, or a stable hash of (row id, purpose) for resources
 * that have no row of their own, so re-exporting a procedure yields the same ids.
 *
 * Type-only imports plus relative `.ts` imports, so this runs unchanged in Next and under Node.
 */
import { createHash } from "node:crypto";
import type {
  Bundle,
  BundleEntry,
  CodeableConcept,
  Composition,
  CompositionSection,
  Condition,
  Device,
  Encounter,
  Extension,
  FhirResource,
  Location,
  MedicationAdministration,
  MedicationRequest,
  Observation,
  ObservationComponent,
  Organization,
  Patient,
  Practitioner,
  Procedure,
  Quantity,
  Reference,
} from "fhir/r4";
import type { FhirSource } from "./load.ts";
import {
  CLINICAL_ACTIVE,
  COMPLICATION,
  CONDITION_CATEGORY,
  DATA_ABSENT_NOT_PERFORMED,
  DOSE_UNIT_UCUM,
  EMPTY_REASON,
  ENCOUNTER_CLASS,
  HRUDAYA,
  INDICATION,
  LOINC,
  OBSERVATION_CATEGORY,
  PROCEDURE,
  RISK_FACTOR,
  SYNTHETIC_TAG,
  SYSTEM,
  UCUM,
  VESSEL_SITE,
  coding,
  concept,
  type CodeEntry,
} from "./codes.ts";
import { FREQUENCY_TEXT, lesionName } from "../report-format.ts";

type P = FhirSource;
type Vessel = P["vessel_findings"][number];
type Intervention = P["interventions"][number];
type DeviceRow = Intervention["devices_used"][number];
type ProcMed = P["procedure_medications"][number];

// ─── Ids and references ────────────────────────────────────────────────────────

/** Deterministic UUID (v5-style layout) from a name — for resources without their own row. */
export function stableId(...parts: string[]): string {
  const h = createHash("sha1").update(parts.join("|")).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const ref = (id: string, display?: string): Reference => (display ? { reference: `urn:uuid:${id}`, display } : { reference: `urn:uuid:${id}` });

export const ids = (p: P) => ({
  bundle: stableId(p.id, "bundle"),
  composition: stableId(p.id, "composition"),
  encounter: stableId(p.id, "encounter"),
  indication: stableId(p.id, "indication"),
  location: p.facility ? stableId(p.facility.id, "location") : null,
  bp: stableId(p.id, "bp"),
  hr: stableId(p.id, "heart-rate"),
  aortic: stableId(p.id, "aortic-pressure"),
  lvedp: stableId(p.id, "lvedp"),
  lvef: stableId(p.id, "lvef"),
  lab: (name: string) => stableId(p.id, "lab", name),
  detail: (name: string) => stableId(p.id, "detail", name),
});

// ─── Small helpers ─────────────────────────────────────────────────────────────

const humanize = (v: string) => {
  const w = v.replace(/_/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
};

const ROLE: Record<string, string> = {
  interventional_cardiologist: "Interventional cardiologist",
  fellow: "Fellow",
  cath_lab_technologist: "Cath lab technologist",
  nurse: "Nurse",
};
const CATEGORY_TEXT: Record<string, string> = {
  stent: "stent", balloon_sc: "semi-compliant balloon", balloon_nc: "non-compliant balloon", balloon_dcb: "drug-coated balloon",
  balloon_scoring: "scoring balloon", guidewire: "guidewire", other: "device",
};
const ROUTE_TEXT: Record<string, string> = {
  oral: "Oral", sc: "Subcutaneous", iv: "Intravenous", topical: "Topical", sublingual: "Sublingual", intra_arterial: "Intra-arterial",
};
const LVEF_SOURCE: Record<string, string> = {
  echo: "Echocardiography", ventriculography: "Left ventriculography", mri: "Cardiac MRI", other: "Other method",
};

const qty = (value: number, code: string, unit = code): Quantity => ({ value, unit, system: SYSTEM.ucum, code });

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const narrative = (lines: string[]) => ({
  status: "generated" as const,
  div: `<div xmlns="http://www.w3.org/1999/xhtml">${lines.map((l) => `<p>${escapeXml(l)}</p>`).join("")}</div>`,
});

const vesselText = (v: Pick<Vessel, "vessel" | "segment">) => lesionName(v.vessel, v.segment);

/** The operator for performer/requester; reviewer only where the spec says so. */
const operatorRef = (p: P) => (p.operator ? ref(p.operator.id, p.operator.full_name) : undefined);

// ─── Patient, practitioners, organisation, location ────────────────────────────

export function patientResource(p: P): Patient {
  const pt = p.patient;
  return {
    resourceType: "Patient",
    id: pt.id,
    ...(pt.is_synthetic ? { meta: { tag: [SYNTHETIC_TAG] } } : {}),
    identifier: [{ system: HRUDAYA.mrnSystem, value: pt.mrn }],
    name: [{ text: pt.full_name }],
    gender: pt.sex,
    birthDate: pt.date_of_birth,
  };
}

export function practitionerResources(p: P): Practitioner[] {
  const people = new Map<string, { id: string; full_name: string; role: string }>();
  if (p.operator) people.set(p.operator.id, p.operator);
  if (p.reviewer) people.set(p.reviewer.id, p.reviewer);
  return [...people.values()].map((o) => ({
    resourceType: "Practitioner",
    id: o.id,
    name: [{ text: o.full_name }],
    qualification: [{ code: { text: ROLE[o.role] ?? humanize(o.role) } }],
  }));
}

export function organizationResource(p: P): Organization | null {
  if (!p.facility) return null;
  return {
    resourceType: "Organization",
    id: p.facility.id,
    name: p.facility.name,
    address: [{ city: p.facility.city }],
  };
}

export function locationResource(p: P): Location | null {
  const id = ids(p).location;
  if (!p.facility || !id) return null;
  return {
    resourceType: "Location",
    id,
    name: p.facility.cath_lab_name,
    managingOrganization: ref(p.facility.id, p.facility.name),
  };
}

// ─── Conditions ────────────────────────────────────────────────────────────────

export function conditionResources(p: P): Condition[] {
  const subject = ref(p.patient.id);
  const out: Condition[] = [];
  if (p.indication) {
    out.push({
      resourceType: "Condition",
      id: ids(p).indication,
      clinicalStatus: { coding: [coding(CLINICAL_ACTIVE)] },
      category: [{ coding: [coding(CONDITION_CATEGORY.encounterDiagnosis)], text: "Indication for procedure" }],
      code: concept(INDICATION[p.indication], p.indication === "stemi" ? "STEMI" : p.indication === "nstemi" ? "NSTEMI" : humanize(p.indication)),
      subject,
      encounter: ref(ids(p).encounter),
    });
  }
  for (const r of p.patient.risk_factors) {
    const text = humanize(r.factor) + (r.detail ? ` — ${r.detail}` : "");
    out.push({
      resourceType: "Condition",
      id: r.id,
      clinicalStatus: { coding: [coding(CLINICAL_ACTIVE)] },
      category: [{ coding: [coding(CONDITION_CATEGORY.problemListItem)], text: "Risk factor" }],
      code: concept(RISK_FACTOR[r.factor], text),
      subject,
    });
  }
  return out;
}

// ─── Encounter ─────────────────────────────────────────────────────────────────

const istDate = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function encounterResource(p: P): Encounter {
  const d = p.discharge;
  // Spec §4.2: AMB only for an elective day case discharged the same (IST) day; otherwise IMP.
  const sameDay = !!(d && p.admitted_at && istDate(p.admitted_at) === istDate(d.discharged_at));
  const cls = p.urgency === "elective" && sameDay ? ENCOUNTER_CLASS.ambulatory : ENCOUNTER_CLASS.inpatient;
  const period = { ...(p.admitted_at ? { start: p.admitted_at } : {}), ...(d ? { end: d.discharged_at } : {}) };
  const loc = ids(p).location;
  return {
    resourceType: "Encounter",
    id: ids(p).encounter,
    status: d ? "finished" : "in-progress",
    class: coding(cls),
    subject: ref(p.patient.id),
    ...(Object.keys(period).length ? { period } : {}),
    ...(p.indication ? { reasonReference: [ref(ids(p).indication)] } : {}),
    ...(loc ? { location: [{ location: ref(loc, p.facility?.cath_lab_name) }] } : {}),
    ...(p.facility ? { serviceProvider: ref(p.facility.id, p.facility.name) } : {}),
  };
}

// ─── Procedure and devices ─────────────────────────────────────────────────────

export function procedureResource(p: P): Procedure {
  const isPci = p.procedure_type === "pci" || p.procedure_type === "angiography_and_pci";
  const code: CodeableConcept = isPci
    ? {
        coding: [coding(PROCEDURE.pci), coding(PROCEDURE.coronaryAngiography)],
        text: "Coronary angiography and percutaneous coronary intervention",
      }
    : concept(PROCEDURE.coronaryAngiography, "Coronary angiography");

  const vessels = new Map(p.vessel_findings.map((v) => [v.id, v]));
  const treated = [...new Set(p.interventions.map((i) => i.vessel_finding_id))]
    .map((id) => vessels.get(id))
    .filter((v): v is Vessel => !!v);

  const focal = p.interventions.flatMap((i) =>
    i.devices_used
      .filter((d) => d.category === "stent" || d.category === "balloon_dcb")
      .map((d) => ({ action: { text: d.category === "stent" ? "implanted" : "applied" }, manipulated: ref(d.id, d.product_name) })),
  );

  const extension: Extension[] = [];
  if (p.urgency) extension.push({ url: HRUDAYA.extUrgency, valueCode: p.urgency });
  if (p.access_site) extension.push({ url: HRUDAYA.extAccessSite, valueCodeableConcept: { text: humanize(p.access_site) } });
  if (p.dominance) extension.push({ url: HRUDAYA.extDominance, valueCode: p.dominance });

  const loc = ids(p).location;
  return {
    resourceType: "Procedure",
    id: p.id,
    ...(extension.length ? { extension } : {}),
    status: p.status === "draft" ? "in-progress" : "completed",
    code,
    subject: ref(p.patient.id),
    encounter: ref(ids(p).encounter),
    ...(p.started_at ? { performedPeriod: { start: p.started_at, ...(p.ended_at ? { end: p.ended_at } : {}) } } : {}),
    ...(p.operator ? { performer: [{ actor: ref(p.operator.id, p.operator.full_name) }] } : {}),
    ...(loc ? { location: ref(loc, p.facility?.cath_lab_name) } : {}),
    ...(treated.length ? { bodySite: treated.map((v) => concept(VESSEL_SITE[v.vessel], vesselText(v))) } : {}),
    ...(p.complications.length
      ? {
          complication: p.complications.map((c) =>
            concept(COMPLICATION[c.complication], `${humanize(c.complication)} (${c.severity})${c.outcome ? ` — ${c.outcome}` : ""}`),
          ),
        }
      : {}),
    ...(focal.length ? { focalDevice: focal } : {}),
    ...(p.outcome_summary ? { note: [{ text: p.outcome_summary }] } : {}),
  };
}

const PHASE_ADJ: Record<string, string> = { pre_dilation: "Pre-dilation", deployment: "Deployed", post_dilation: "Post-dilation", other: "Other" };

export function deviceResources(p: P): Device[] {
  return p.interventions.flatMap((i) =>
    i.devices_used.map((d: DeviceRow): Device => {
      const property: NonNullable<Device["property"]> = [
        { type: { text: "Diameter" }, valueQuantity: [qty(d.diameter_mm, UCUM.mm)] },
        { type: { text: "Length" }, valueQuantity: [qty(d.length_mm, UCUM.mm)] },
      ];
      if (d.inflation_atm !== null) property.push({ type: { text: "Inflation pressure" }, valueQuantity: [qty(d.inflation_atm, UCUM.atm)] });
      if (d.quantity > 1) property.push({ type: { text: "Quantity used" }, valueQuantity: [{ value: d.quantity }] });
      return {
        resourceType: "Device",
        id: d.id,
        ...(d.udi ? { udiCarrier: [{ carrierHRF: d.udi }] } : {}),
        ...(d.manufacturer ? { manufacturer: d.manufacturer } : {}),
        ...(d.expiry_date ? { expirationDate: d.expiry_date } : {}),
        ...(d.lot_number ? { lotNumber: d.lot_number } : {}),
        deviceName: [{ name: d.product_name, type: "user-friendly-name" }],
        type: { text: `${d.product_name} — ${PHASE_ADJ[d.phase]} ${CATEGORY_TEXT[d.category]}` },
        property,
        patient: ref(p.patient.id),
      };
    }),
  );
}

// ─── Observations ──────────────────────────────────────────────────────────────

function obsBase(p: P, id: string, category: CodeEntry, code: CodeableConcept, effective?: string | null): Observation {
  const performer = operatorRef(p);
  return {
    resourceType: "Observation",
    id,
    status: "final",
    category: [{ coding: [coding(category)] }],
    code,
    subject: ref(p.patient.id),
    encounter: ref(ids(p).encounter),
    ...(effective ? { effectiveDateTime: effective } : {}),
    ...(performer ? { performer: [performer] } : {}),
  };
}

export function vesselObservations(p: P): Observation[] {
  const out: Observation[] = [];
  for (const v of p.vessel_findings) {
    const name = vesselText(v);
    const site = concept(VESSEL_SITE[v.vessel], name);
    const component: ObservationComponent[] = [{ code: { text: "Culprit lesion" }, valueBoolean: v.is_culprit }];
    if (v.lesion_length_mm !== null) component.push({ code: { text: "Lesion length" }, valueQuantity: qty(v.lesion_length_mm, UCUM.mm) });
    if (v.calcification) component.push({ code: { text: "Calcification" }, valueString: v.calcification });
    component.push({ code: { text: "Thrombus" }, valueBoolean: v.thrombus });
    component.push({ code: { text: "Bifurcation" }, valueBoolean: v.bifurcation });
    out.push({
      ...obsBase(p, v.id, OBSERVATION_CATEGORY.imaging, { text: `Coronary artery stenosis — ${name}` }, p.started_at),
      bodySite: site,
      valueQuantity: qty(v.stenosis_pct, UCUM.percent),
      ...(v.lesion_notes ? { note: [{ text: v.lesion_notes }] } : {}),
      component,
    });
    out.push({
      ...obsBase(p, stableId(v.id, "timi"), OBSERVATION_CATEGORY.imaging, { text: `TIMI flow grade — ${name}` }, p.started_at),
      bodySite: site,
      valueInteger: v.timi_flow,
    });
  }
  return out;
}

export function interventionObservations(p: P): Observation[] {
  const vessels = new Map(p.vessel_findings.map((v) => [v.id, v]));
  return p.interventions.flatMap((i) => {
    const v = vessels.get(i.vessel_finding_id);
    const name = v ? vesselText(v) : "treated lesion";
    const site = v ? concept(VESSEL_SITE[v.vessel], name) : undefined;
    return [
      {
        ...obsBase(p, stableId(i.id, "residual"), OBSERVATION_CATEGORY.imaging, { text: `Residual stenosis post-intervention — ${name}` }, p.ended_at),
        ...(site ? { bodySite: site } : {}),
        valueQuantity: qty(i.residual_stenosis_pct, UCUM.percent),
      },
      {
        ...obsBase(p, stableId(i.id, "timi-post"), OBSERVATION_CATEGORY.imaging, { text: `TIMI flow grade post-intervention — ${name}` }, p.ended_at),
        ...(site ? { bodySite: site } : {}),
        valueInteger: i.timi_flow_post,
      },
    ];
  });
}

export function baselineObservations(p: P): Observation[] {
  const out: Observation[] = [];
  const when = p.admitted_at ?? p.started_at;
  const id = ids(p);
  if (p.baseline_bp_systolic !== null || p.baseline_bp_diastolic !== null) {
    const component: ObservationComponent[] = [];
    if (p.baseline_bp_systolic !== null) component.push({ code: concept(LOINC.systolic, "Systolic blood pressure"), valueQuantity: qty(p.baseline_bp_systolic, UCUM.mmHg) });
    if (p.baseline_bp_diastolic !== null) component.push({ code: concept(LOINC.diastolic, "Diastolic blood pressure"), valueQuantity: qty(p.baseline_bp_diastolic, UCUM.mmHg) });
    out.push({ ...obsBase(p, id.bp, OBSERVATION_CATEGORY.vitalSigns, concept(LOINC.bpPanel, "Blood pressure"), when), component });
  }
  if (p.baseline_heart_rate !== null) {
    out.push({ ...obsBase(p, id.hr, OBSERVATION_CATEGORY.vitalSigns, concept(LOINC.heartRate, "Heart rate"), when), valueQuantity: qty(p.baseline_heart_rate, UCUM.perMin) });
  }
  const labs: [string, number | null, CodeEntry, string, string][] = [
    ["creatinine", p.creatinine_umol_l, LOINC.creatinine, "Creatinine", UCUM.umolPerL],
    ["egfr", p.egfr, LOINC.egfr, "eGFR", UCUM.egfr],
    ["haemoglobin", p.haemoglobin_g_dl, LOINC.haemoglobin, "Haemoglobin", UCUM.gPerDl],
    ["platelets", p.platelets_x10e9_l, LOINC.platelets, "Platelets", UCUM.platelets],
  ];
  for (const [key, value, entry, text, unit] of labs) {
    if (value === null) continue;
    out.push({ ...obsBase(p, id.lab(key), OBSERVATION_CATEGORY.laboratory, concept(entry, text), when), valueQuantity: qty(value, unit) });
  }
  return out;
}

/** Aortic pressure and LVEDP (angiography section). LVEDP follows the three-state rule. */
export function haemodynamicObservations(p: P): Observation[] {
  const out: Observation[] = [];
  const id = ids(p);
  if (p.aortic_pressure_systolic !== null || p.aortic_pressure_diastolic !== null) {
    const component: ObservationComponent[] = [];
    if (p.aortic_pressure_systolic !== null) component.push({ code: { text: "Aortic systolic pressure" }, valueQuantity: qty(p.aortic_pressure_systolic, UCUM.mmHg) });
    if (p.aortic_pressure_diastolic !== null) component.push({ code: { text: "Aortic diastolic pressure" }, valueQuantity: qty(p.aortic_pressure_diastolic, UCUM.mmHg) });
    out.push({ ...obsBase(p, id.aortic, OBSERVATION_CATEGORY.procedure, { text: "Aortic pressure (invasive)" }, p.started_at), component });
  }
  const lvedp = threeState(p, p.lvedp_status, id.lvedp, OBSERVATION_CATEGORY.procedure, { text: "Left ventricular end-diastolic pressure" }, p.started_at);
  if (lvedp) out.push(p.lvedp_status === "recorded" && p.lvedp_mmhg !== null ? { ...lvedp, valueQuantity: qty(p.lvedp_mmhg, UCUM.mmHg) } : lvedp);
  return out;
}

/**
 * Three-state rule (spec §4.6): recorded → Observation with a value (added by the caller);
 * not_performed → Observation with dataAbsentReason = not-performed; not_recorded → nothing.
 */
function threeState(
  p: P,
  status: "not_recorded" | "not_performed" | "recorded",
  id: string,
  category: CodeEntry,
  code: CodeableConcept,
  effective?: string | null,
): Observation | null {
  if (status === "not_recorded") return null;
  const base = obsBase(p, id, category, code, effective);
  return status === "not_performed" ? { ...base, dataAbsentReason: { coding: [coding(DATA_ABSENT_NOT_PERFORMED)] } } : base;
}

export function lvefObservation(p: P): Observation | null {
  // Spec §4.6: the measured time where we have one, otherwise started_at.
  const o = threeState(p, p.lvef_status, ids(p).lvef, OBSERVATION_CATEGORY.imaging, concept(LOINC.lvef, "Left ventricular ejection fraction"),
    (p.lvef_status === "recorded" ? p.lvef_measured_on : null) ?? p.started_at);
  if (!o) return null;
  if (p.lvef_status !== "recorded" || p.lvef_pct === null) return o;
  return {
    ...o,
    valueQuantity: qty(p.lvef_pct, UCUM.percent),
    ...(p.lvef_source ? { method: { text: LVEF_SOURCE[p.lvef_source] } } : {}),
  };
}

export function procedureDetailObservations(p: P): Observation[] {
  const id = ids(p);
  const out: Observation[] = [];
  const add = (key: string, text: string, value: number | null, unit: string, note?: string | null) => {
    if (value === null) return;
    out.push({
      ...obsBase(p, id.detail(key), OBSERVATION_CATEGORY.procedure, { text }, p.started_at),
      valueQuantity: qty(value, unit),
      ...(note ? { note: [{ text: note }] } : {}),
    });
  };
  add("contrast", "Contrast volume administered", p.contrast_volume_ml, UCUM.mL, p.contrast_agent);
  add("fluoroscopy", "Fluoroscopy time", p.fluoroscopy_time_min, UCUM.min);
  add("air-kerma", "Cumulative air kerma", p.air_kerma_mgy, UCUM.mGy);
  add("dap", "Dose-area product", p.dap_gy_cm2, UCUM.gyCm2);
  return out;
}

/**
 * ACT after an anticoagulant dose. Linked to the dose with `partOf` — spec §4.6 says
 * `derivedFrom`, but R4 does not allow derivedFrom → MedicationAdministration (validator error).
 */
export function actObservations(p: P): Observation[] {
  return p.procedure_medications
    .filter((m) => m.act_seconds !== null)
    .map((m) => ({
      ...obsBase(p, stableId(m.id, "act"), OBSERVATION_CATEGORY.laboratory, concept(LOINC.act, "Activated clotting time"), m.act_measured_at ?? m.administered_at ?? p.started_at),
      valueQuantity: qty(m.act_seconds as number, UCUM.s),
      partOf: [ref(m.id, m.drug_name)],
    }));
}

// ─── Medications ───────────────────────────────────────────────────────────────

function doseQuantity(dose: number | null, unit: string | null): Quantity | undefined {
  if (dose === null || !unit) return undefined;
  const u = DOSE_UNIT_UCUM[unit as keyof typeof DOSE_UNIT_UCUM];
  return u ? { value: dose, unit: u.unit, system: SYSTEM.ucum, code: u.code } : undefined;
}

export function medicationAdministrations(p: P): MedicationAdministration[] {
  return p.procedure_medications.map((m: ProcMed) => {
    // A dose with no recorded time is placed within the procedure phase its timing names;
    // no time is invented.
    const effective: Pick<MedicationAdministration, "effectiveDateTime" | "effectivePeriod"> = m.administered_at
      ? { effectiveDateTime: m.administered_at }
      : m.timing === "pre_procedure"
        ? { effectivePeriod: { ...(p.started_at ? { end: p.started_at } : {}) } }
        : m.timing === "intra_procedure"
          ? { effectivePeriod: { ...(p.started_at ? { start: p.started_at } : {}), ...(p.ended_at ? { end: p.ended_at } : {}) } }
          : { effectivePeriod: { ...(p.ended_at ? { start: p.ended_at } : {}) } };
    const dose = doseQuantity(m.dose, m.dose_unit);
    return {
      resourceType: "MedicationAdministration",
      id: m.id,
      status: "completed",
      medicationCodeableConcept: { text: m.drug_name },
      subject: ref(p.patient.id),
      context: ref(ids(p).encounter),
      ...effective,
      ...(m.notes ? { reasonCode: [{ text: m.notes }] } : {}),
      // mad-1: a dosage must carry a dose or rate. With no recorded dose, the route goes in a note.
      ...(dose
        ? { dosage: { route: { text: ROUTE_TEXT[m.route] ?? humanize(m.route) }, dose } }
        : { note: [{ text: `Route: ${ROUTE_TEXT[m.route] ?? humanize(m.route)}; dose not recorded` }] }),
    };
  });
}

/** "12 months" / "6 weeks" / "10 days" → UCUM Duration; anything else is not parsed. */
export function parseDuration(text: string | null) {
  if (!text) return undefined;
  const m = /^\s*(\d+)\s*(month|week|day)s?\b/i.exec(text);
  if (!m) return undefined;
  const unit = m[2].toLowerCase();
  const code = unit === "month" ? "mo" : unit === "week" ? "wk" : "d";
  return { value: Number(m[1]), unit: `${unit}${Number(m[1]) === 1 ? "" : "s"}`, system: SYSTEM.ucum, code };
}

export function medicationRequests(p: P): MedicationRequest[] {
  const d = p.discharge;
  if (!d) return [];
  const daptPlan: Extension[] = [];
  if (d.dapt_planned_months !== null) daptPlan.push({ url: "plannedMonths", valueInteger: d.dapt_planned_months });
  if (d.dapt_review_date) daptPlan.push({ url: "reviewDate", valueDate: d.dapt_review_date });
  const requester = operatorRef(p);

  return d.discharge_medications.map((m): MedicationRequest => {
    const dose = doseQuantity(m.dose, m.dose_unit);
    const supply = parseDuration(m.duration);
    return {
      resourceType: "MedicationRequest",
      id: m.id,
      ...(m.is_dapt && daptPlan.length ? { extension: [{ url: HRUDAYA.extDaptPlan, extension: daptPlan }] } : {}),
      status: "active",
      intent: "order",
      ...(m.is_dapt ? { category: [{ text: "DAPT" }] } : {}),
      medicationCodeableConcept: { text: m.drug_name },
      subject: ref(p.patient.id),
      encounter: ref(ids(p).encounter),
      authoredOn: d.discharged_at,
      ...(requester ? { requester } : {}),
      dosageInstruction: [
        {
          ...(m.purpose ? { text: m.purpose } : {}),
          timing: { code: { text: FREQUENCY_TEXT[m.frequency] } },
          ...(m.frequency === "prn" ? { asNeededBoolean: true } : {}),
          route: { text: ROUTE_TEXT[m.route] ?? humanize(m.route) },
          ...(dose ? { doseAndRate: [{ doseQuantity: dose }] } : {}),
        },
      ],
      ...(supply ? { dispenseRequest: { expectedSupplyDuration: supply } } : {}),
    };
  });
}

// ─── Composition and Bundle ────────────────────────────────────────────────────

type Built = {
  patient: Patient;
  practitioners: Practitioner[];
  organization: Organization | null;
  location: Location | null;
  conditions: Condition[];
  encounter: Encounter;
  procedure: Procedure;
  devices: Device[];
  vesselObs: Observation[];
  interventionObs: Observation[];
  baselineObs: Observation[];
  haemoObs: Observation[];
  lvef: Observation | null;
  detailObs: Observation[];
  actObs: Observation[];
  administrations: MedicationAdministration[];
  requests: MedicationRequest[];
};

const refsTo = (rs: { id?: string }[]) => rs.map((r) => ref(r.id as string));

function section(title: string, lines: string[], entries: Reference[], emptyReason?: CodeEntry): CompositionSection {
  return {
    title,
    text: narrative(lines),
    ...(entries.length ? { entry: entries } : emptyReason ? { emptyReason: { coding: [coding(emptyReason)] } } : {}),
  };
}

export function compositionResource(p: P, b: Built, now: string): Composition {
  const reviewed = p.status === "reviewed";
  const author = p.reviewer ?? p.operator;
  const culprits = p.vessel_findings.filter((v) => v.is_culprit).map(vesselText);
  const durationMin =
    p.started_at && p.ended_at ? Math.round((new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()) / 60_000) : null;
  const d = p.discharge;

  const sections: CompositionSection[] = [
    section(
      "Patient & baseline",
      [
        `Indication: ${p.indication ? (p.indication === "stemi" ? "STEMI" : p.indication === "nstemi" ? "NSTEMI" : humanize(p.indication)) : "not recorded"}.`,
        `Urgency: ${p.urgency ? humanize(p.urgency) : "not recorded"}.`,
        `${p.patient.risk_factors.length} risk factor(s) recorded.`,
      ],
      [ref(b.patient.id as string), ...refsTo(b.conditions), ...refsTo(b.baselineObs)],
    ),
    section(
      "Access",
      [`Access: ${p.access_site ? humanize(p.access_site) : "not recorded"}${p.sheath_size_fr ? `, ${p.sheath_size_fr}F sheath` : ""}.`],
      [ref(b.procedure.id as string)],
    ),
    section(
      "Angiography",
      [`${p.vessel_findings.length} vessel(s) assessed.`, culprits.length ? `Culprit: ${culprits.join(", ")}.` : "No culprit lesion marked."],
      [...refsTo(b.vesselObs), ...refsTo(b.haemoObs)],
    ),
    section(
      "Intervention & devices",
      p.interventions.length
        ? [`${p.interventions.length} treated lesion(s); ${b.devices.length} device(s) recorded.`]
        : ["Diagnostic angiography only — no intervention."],
      [ref(b.procedure.id as string), ...refsTo(b.devices), ...refsTo(b.interventionObs)],
    ),
    section(
      "Procedure medications",
      b.administrations.length ? [`${b.administrations.length} medication(s) given around the procedure.`] : ["None recorded."],
      [...refsTo(b.administrations), ...refsTo(b.actObs)],
      EMPTY_REASON.nilKnown,
    ),
    section(
      "Procedure details",
      [durationMin !== null ? `Procedure duration: ${durationMin} min.` : "Procedure duration not recorded."],
      [ref(b.procedure.id as string), ...refsTo(b.detailObs)],
    ),
    section(
      "Complications",
      p.complications.length ? [`${p.complications.length} complication(s) recorded.`] : ["None."],
      p.complications.length ? [ref(b.procedure.id as string)] : [],
      EMPTY_REASON.nilKnown,
    ),
    section(
      "Immediate outcome",
      [
        `Condition: ${p.post_procedure_condition ? humanize(p.post_procedure_condition) : "not recorded"}.`,
        `Destination: ${p.post_procedure_destination ? humanize(p.post_procedure_destination) : "not recorded"}.`,
        ...(p.immediate_care_notes ? [`Plan: ${p.immediate_care_notes}`] : []),
      ],
      [ref(b.encounter.id as string), ...(b.lvef ? [ref(b.lvef.id as string)] : [])],
    ),
    section(
      "Discharge",
      d ? [`Discharged ${istDate(d.discharged_at)}; follow-up ${d.follow_up_date} (${d.follow_up_clinic}).`] : ["Not yet discharged."],
      d ? [ref(b.encounter.id as string), ...refsTo(b.requests)] : [],
      EMPTY_REASON.notStarted,
    ),
  ];

  return {
    resourceType: "Composition",
    id: ids(p).composition,
    status: reviewed ? "final" : "preliminary",
    type: concept(LOINC.cathReport, "Cardiac catheterisation report"),
    subject: ref(p.patient.id),
    encounter: ref(ids(p).encounter),
    date: p.reviewed_at ?? p.ended_at ?? now,
    author: [author ? ref(author.id, author.full_name) : ref(b.organization?.id ?? p.patient.id)],
    title: `Cardiac catheterisation report — ${p.case_code}`,
    ...(reviewed && p.reviewer && p.reviewed_at
      ? { attester: [{ mode: "professional", time: p.reviewed_at, party: ref(p.reviewer.id, p.reviewer.full_name) }] }
      : {}),
    ...(p.facility ? { custodian: ref(p.facility.id, p.facility.name) } : {}),
    section: sections,
  };
}

/**
 * The whole document. `now` is the assembly time (Bundle.timestamp); everything else is derived
 * from the rows, so two exports differ only in that timestamp.
 */
export function procedureToBundle(p: P, now: string): Bundle {
  const b: Built = {
    patient: patientResource(p),
    practitioners: practitionerResources(p),
    organization: organizationResource(p),
    location: locationResource(p),
    conditions: conditionResources(p),
    encounter: encounterResource(p),
    procedure: procedureResource(p),
    devices: deviceResources(p),
    vesselObs: vesselObservations(p),
    interventionObs: interventionObservations(p),
    baselineObs: baselineObservations(p),
    haemoObs: haemodynamicObservations(p),
    lvef: lvefObservation(p),
    detailObs: procedureDetailObservations(p),
    actObs: actObservations(p),
    administrations: medicationAdministrations(p),
    requests: medicationRequests(p),
  };
  const composition = compositionResource(p, b, now);

  const resources: FhirResource[] = [
    composition,
    b.patient,
    b.encounter,
    ...(b.organization ? [b.organization] : []),
    ...(b.location ? [b.location] : []),
    ...b.practitioners,
    ...b.conditions,
    b.procedure,
    ...b.devices,
    ...b.baselineObs,
    ...b.vesselObs,
    ...b.haemoObs,
    ...b.interventionObs,
    ...b.detailObs,
    ...(b.lvef ? [b.lvef] : []),
    ...b.actObs,
    ...b.administrations,
    ...b.requests,
  ];

  const entry: BundleEntry[] = resources.map((resource) => ({ fullUrl: `urn:uuid:${resource.id}`, resource }));
  return {
    resourceType: "Bundle",
    id: ids(p).bundle,
    ...(p.patient.is_synthetic ? { meta: { tag: [SYNTHETIC_TAG] } } : {}),
    identifier: { system: HRUDAYA.caseCodeSystem, value: p.case_code },
    type: "document",
    timestamp: now,
    entry,
  };
}

/** Resource type → count, for the report-page preview. */
export function resourceCounts(bundle: Bundle): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of bundle.entry ?? []) {
    const t = e.resource?.resourceType ?? "Unknown";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()];
}
