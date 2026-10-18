/**
 * Procedural events (Week 7 spec §2.8a, §3.5) and their link to in-hospital outcomes (§2.11).
 * Shared by the Intervention & devices sheet and the server-side validation, so the grades a
 * clinician can pick are exactly the grades the server accepts.
 *
 * Type-only imports, so it runs under Node as well as in Next.
 */
import type { Enums } from "./labels.ts";

type EventType = Enums["complication_type"];

/**
 * `complications.grade` is text, validated per event type here (spec §2.8a): NHLBI dissection type,
 * Ellis perforation class, arrhythmia type (owner 2026-10-18: one 'arrhythmia' value, type in grade).
 * Event types not listed take no grade.
 */
export const EVENT_GRADES: Partial<Record<EventType, readonly string[]>> = {
  dissection: ["A", "B", "C", "D", "E", "F"],
  perforation: ["Ellis I", "Ellis II", "Ellis III", "Ellis III (cavity spilling)"],
  arrhythmia: ["VF", "VT", "Complete heart block", "AF with compromise"],
};

export const GRADE_LEGEND: Partial<Record<EventType, string>> = {
  dissection: "Dissection type (NHLBI)",
  perforation: "Perforation class (Ellis)",
  arrhythmia: "Arrhythmia",
};

/** The event picker's groups (spec §3.5: vessel · rhythm/haemodynamic · systemic · access). */
export const EVENT_GROUPS: { title: string; types: EventType[] }[] = [
  {
    title: "Vessel",
    types: ["dissection", "perforation", "no_reflow", "side_branch_closure", "abrupt_vessel_closure", "acute_stent_thrombosis", "distal_embolisation", "air_embolism", "coronary_spasm", "unplanned_repeat_pci"],
  },
  { title: "Rhythm / haemodynamic", types: ["arrhythmia", "cardiac_arrest", "new_cardiogenic_shock", "cardiac_tamponade", "pulmonary_oedema"] },
  { title: "Systemic", types: ["stroke", "contrast_reaction", "contrast_nephropathy", "death", "other"] },
  { title: "Access", types: ["access_site_haematoma", "radial_occlusion"] },
];

/** tri_state outcome columns of in_hospital_outcomes, in the Outcome tab's order. */
export const OUTCOME_KEYS = [
  "mi", "stroke", "death", "bleeding", "transfusion", "vascular_status", "aki", "new_dialysis", "emergency_cabg",
  "cardiac_tamponade", "unplanned_repeat_pci",
] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

export const OUTCOME_LABEL: Record<OutcomeKey, string> = {
  mi: "Periprocedural MI",
  stroke: "Stroke",
  death: "Death",
  bleeding: "Bleeding",
  transfusion: "Transfusion",
  vascular_status: "Vascular complications",
  aki: "Acute kidney injury",
  new_dialysis: "New dialysis",
  emergency_cabg: "Emergency CABG",
  cardiac_tamponade: "Cardiac tamponade",
  unplanned_repeat_pci: "Unplanned repeat PCI",
};

/**
 * "Record as outcome" (spec §3.5): the outcome an event most often explains, offered first. The
 * clinician can pick another (e.g. tamponade ← perforation).
 */
export const SUGGESTED_OUTCOME: Partial<Record<EventType, { key: OutcomeKey; vascular?: Enums["vascular_complication"] }>> = {
  stroke: { key: "stroke" },
  death: { key: "death" },
  cardiac_tamponade: { key: "cardiac_tamponade" },
  perforation: { key: "cardiac_tamponade" },
  unplanned_repeat_pci: { key: "unplanned_repeat_pci" },
  access_site_haematoma: { key: "vascular_status", vascular: "haematoma" },
  radial_occlusion: { key: "vascular_status", vascular: "radial_occlusion" },
  contrast_nephropathy: { key: "aki" },
};

/** Grade valid for this event type? null is always valid (a grade is optional). */
export function gradeAllowed(type: EventType, grade: string | null): boolean {
  if (grade === null) return true;
  return (EVENT_GRADES[type] ?? []).includes(grade);
}
