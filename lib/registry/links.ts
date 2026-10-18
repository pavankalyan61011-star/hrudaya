/**
 * Where each registry element is entered (spec §3.7: "clicking an item opens the sheet that holds it").
 * Sheets for Week 7 fields; capture steps for the Week 1 fields that live there. Returns null when
 * the record can't be edited, or the place can't take the value during an amendment (patient
 * identity is locked).
 */
import type { ProcedureFull } from "../queries/procedures.ts";
import { sheetHref } from "../sheets.ts";

const STEP: Record<string, number> = {
  patient_date_of_birth: 1, patient_sex: 1,
  admission_at: 2, indication: 2, urgency: 2, troponin: 2, creatinine_pre: 2, haemoglobin_pre: 2, access_site: 2, primary_operator: 2,
  coronary_dominance: 3, coronary_anatomy: 3,
  procedure_start: 5, contrast_volume: 5, fluoroscopy_time: 5, radiation_dose: 5, procedure_medications: 5,
};
const INDICATION = new Set(["ccs_class", "nyha_class", "cardiogenic_shock", "cardiac_arrest_pre", "prior_pci", "prior_cabg", "stress_test", "symptom_onset_at", "first_medical_contact_at", "door_at", "device_time_at"]);

export function registryHref(key: string, p: ProcedureFull, base: string, editable: boolean): string | null {
  if (!editable) return null;
  const amending = (p.status as string) === "amending";
  if (key in STEP) {
    const step = STEP[key];
    if (step === 1 && amending) return null;
    return `/procedures/new?id=${p.id}&step=${step}`;
  }
  if (INDICATION.has(key)) return sheetHref(base, "indication", { tab: "indication" });
  if (key.startsWith("outcome_") || key === "disposition") return sheetHref(base, "indication", { tab: "outcome" });
  if (key === "lvef_assessed") return sheetHref(base, "haemodynamics");

  const treated = p.interventions.map((i) => ({ iv: i, v: p.vessel_findings.find((v) => v.id === i.vessel_finding_id) }));
  if (key === "lesion_class" || key === "lesion_length") {
    const t = treated.find(({ v }) => v && (key === "lesion_class" ? v.lesion_class === null : v.lesion_length_mm === null));
    return t?.v ? sheetHref(base, "lesion", { row: t.v.id }) : null;
  }
  if (key === "intermediate_lesion_assessment") {
    const t = treated.find(({ v }) => v && v.stenosis_pct >= 40 && v.stenosis_pct <= 69 && !v.lesion_physiology.length && !v.intravascular_imaging.length);
    return t?.v ? sheetHref(base, "physiology", { row: t.v.id, tab: "physiology" }) : null;
  }
  if (key === "pci_techniques" || key === "guiding_catheter") {
    const t = treated.find(({ iv }) => (key === "pci_techniques" ? iv.techniques.length === 0 : iv.guiding_catheter === null));
    return t ? sheetHref(base, "intervention", { row: t.iv.id }) : null;
  }
  return null;
}
