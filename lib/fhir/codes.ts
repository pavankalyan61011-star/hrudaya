/**
 * Code tables for the FHIR export (Week 2 spec §4).
 *
 * Every coded concept carries `verified`. Only a verified code is ever emitted as a `coding`;
 * an unverified or rejected one becomes text-only. Never invent a code.
 *
 * Verification (2026-10-15):
 *  - LOINC: loinc.org detail page for the code (link in `source`).
 *  - SNOMED CT: tx.fhir.org $lookup, SNOMED CT International Edition 2025-02-01 (owner approved
 *    tx.fhir.org because browser.ihtsdotools.org would not load in this environment).
 *  - HL7 / UCUM: the FHIR R4 specification pages for those code systems.
 * The spec's own suggestions that failed verification are kept in REJECTED with the reason.
 *
 * Type imports only: this file runs unchanged under Node (unit tests, scripts) and Next.
 */
import type { CodeableConcept, Coding } from "fhir/r4";
import type { Database } from "../database.types";

type Enums = Database["public"]["Enums"];

export const SYSTEM = {
  snomed: "http://snomed.info/sct",
  loinc: "http://loinc.org",
  ucum: "http://unitsofmeasure.org",
  actCode: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  conditionClinical: "http://terminology.hl7.org/CodeSystem/condition-clinical",
  dataAbsentReason: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
  observationCategory: "http://terminology.hl7.org/CodeSystem/observation-category",
  listEmptyReason: "http://terminology.hl7.org/CodeSystem/list-empty-reason",
  attestationMode: "http://hl7.org/fhir/composition-attestation-mode",
  dataOperation: "http://terminology.hl7.org/CodeSystem/v3-DataOperation",
  conditionCategory: "http://terminology.hl7.org/CodeSystem/condition-category",
} as const;

export type CodeEntry = {
  system: string;
  code: string;
  display: string;
  verified: boolean;
  source?: string;
  note?: string;
};

const SNOMED_VERSION = "SNOMED CT International 2025-02-01";
const sctSource = (code: string) => `https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=${code}`;
const loincSource = (code: string) => `https://loinc.org/${code}/`;

const sct = (code: string, display: string, note?: string): CodeEntry => ({
  system: SYSTEM.snomed, code, display, verified: true, source: sctSource(code), note: note ?? SNOMED_VERSION,
});
const loinc = (code: string, display: string, note?: string): CodeEntry => ({
  system: SYSTEM.loinc, code, display, verified: true, source: loincSource(code), note,
});
const hl7 = (system: string, code: string, display: string, source: string): CodeEntry => ({
  system, code, display, verified: true, source,
});

/** CodeableConcept: a coding only when verified, the human text always. */
export function concept(entry: CodeEntry | null | undefined, text: string): CodeableConcept {
  if (!entry || !entry.verified) return { text };
  return { coding: [coding(entry)], text };
}

export function coding(entry: CodeEntry): Coding {
  return { system: entry.system, code: entry.code, display: entry.display };
}

// ─── Conditions (spec §4.3) ────────────────────────────────────────────────────

/** null = text-only by design or after failed verification (see REJECTED). */
export const INDICATION: Record<Enums["indication"], CodeEntry | null> = {
  // The spec swapped these two; mapped by verified meaning.
  stemi: sct("401303003", "Acute ST segment elevation myocardial infarction"),
  nstemi: sct("401314000", "Acute non-ST segment elevation myocardial infarction"),
  // SNOMED's preferred term for unstable angina.
  unstable_angina: sct("4557003", "Preinfarction syndrome"),
  stable_angina: sct("233819005", "Stable angina"),
  positive_stress_test: null, // spec's 429559004 is "Typical angina"
  pre_op_assessment: null,
  cardiomyopathy_workup: null,
  other: null,
};

export const RISK_FACTOR: Record<Enums["risk_factor"], CodeEntry | null> = {
  hypertension: sct("38341003", "Hypertensive disorder"),
  diabetes_t2: sct("44054006", "Type 2 diabetes mellitus"),
  diabetes_t1: sct("46635009", "Type 1 diabetes mellitus"),
  dyslipidaemia: sct("370992007", "Dyslipidemia"),
  smoking: sct("77176002", "Smoker"),
  ex_smoker: sct("8517006", "Ex-smoker"),
  // Broader than "family history of CHD", but true of every such patient.
  family_history: sct("266894000", "FH: Cardiovascular disease", `${SNOMED_VERSION}; broader than CHD`),
  ckd: sct("709044004", "Chronic kidney disease"),
  obesity: sct("414916001", "Obesity"),
  prior_pci: null, // spec's 415070008 is the PCI procedure itself, not a history of it
  prior_cabg: sct("399261000", "History of coronary artery bypass grafting"),
  prior_mi: sct("399211009", "History of myocardial infarction"),
  other: null,
};

export const CONDITION_CATEGORY = {
  encounterDiagnosis: hl7(SYSTEM.conditionCategory, "encounter-diagnosis", "Encounter Diagnosis", "https://hl7.org/fhir/R4/codesystem-condition-category.html"),
  problemListItem: hl7(SYSTEM.conditionCategory, "problem-list-item", "Problem List Item", "https://hl7.org/fhir/R4/codesystem-condition-category.html"),
};

export const CLINICAL_ACTIVE = hl7(SYSTEM.conditionClinical, "active", "Active", "https://hl7.org/fhir/R4/codesystem-condition-clinical.html");

// ─── Procedure (spec §4.4) ─────────────────────────────────────────────────────

export const PROCEDURE = {
  coronaryAngiography: sct("33367005", "Angiography of coronary artery"),
  pci: sct("415070008", "Percutaneous coronary intervention"),
};

/** Body sites. Branches use their parent's code with the branch in text, where the parent is verified. */
export const VESSEL_SITE: Record<Enums["vessel"], CodeEntry | null> = {
  lmca: null, // spec's 73208009 does not exist in SNOMED CT
  lad: sct("59438005", "Structure of left anterior descending artery"),
  d1: sct("59438005", "Structure of left anterior descending artery", "D1 is a branch of the LAD; parent code + text"),
  d2: sct("59438005", "Structure of left anterior descending artery", "D2 is a branch of the LAD; parent code + text"),
  lcx: null, // spec's 57396005 does not exist in SNOMED CT
  om1: null, // parent (LCX) unverified
  om2: null,
  ramus: null,
  rca: sct("13647002", "Right coronary artery structure"),
  pda: null, // parent depends on dominance (RCA or LCX); text-only rather than guess
  plv: null,
  graft: null,
  other: null,
};

export const COMPLICATION: Record<Enums["complication_type"], CodeEntry | null> = {
  dissection: null, // spec's 234020005 is "Vasculitis secondary to drug"
  perforation: null,
  no_reflow: null,
  access_site_haematoma: sct("385494008", "Hematoma", `${SNOMED_VERSION}; general hematoma — site in text`),
  radial_occlusion: null,
  contrast_nephropathy: null,
  arrhythmia: null,
  cardiac_tamponade: null,
  stroke: null,
  death: null,
  other: null,
  // Week 7 (0011) procedural events: text only until codes are verified (Week 7 step 4).
  side_branch_closure: null,
  abrupt_vessel_closure: null,
  acute_stent_thrombosis: null,
  distal_embolisation: null,
  air_embolism: null,
  coronary_spasm: null,
  significant_arrhythmia: null,
  cardiac_arrest: null,
  new_cardiogenic_shock: null,
  contrast_reaction: null,
  pulmonary_oedema: null,
  unplanned_repeat_pci: null,
};

// ─── Observations and document (spec §4.6, §4.10) ──────────────────────────────

export const LOINC = {
  bpPanel: loinc("85354-9", "Blood pressure panel with all children optional"),
  systolic: loinc("8480-6", "Systolic blood pressure"),
  diastolic: loinc("8462-4", "Diastolic blood pressure"),
  heartRate: loinc("8867-4", "Heart rate"),
  lvef: loinc("10230-1", "Left ventricular Ejection fraction"),
  // Owner-approved correction: spec's 2160-0 is mass/volume; Hrudaya stores µmol/L.
  creatinine: loinc("14682-9", "Creatinine [Moles/volume] in Serum or Plasma"),
  egfr: loinc(
    "62238-1",
    "Glomerular filtration rate [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)/1.73 sq M",
    "Asserts the CKD-EPI formula; Hrudaya does not record which formula was used",
  ),
  haemoglobin: loinc("718-7", "Hemoglobin [Mass/volume] in Blood"),
  platelets: loinc("777-3", "Platelets [#/volume] in Blood by Automated count"),
  // Owner-approved correction: spec's 3184-5 has an invalid check digit.
  act: loinc("3184-9", "Activated clotting time (ACT) of Blood by Coagulation assay"),
  // Owner-approved correction: spec's 34896-3 has an invalid check digit.
  cathReport: loinc("34896-1", "Cardiology Interventional procedure note"),
};

export const OBSERVATION_CATEGORY = {
  vitalSigns: hl7(SYSTEM.observationCategory, "vital-signs", "Vital Signs", "https://hl7.org/fhir/R4/codesystem-observation-category.html"),
  laboratory: hl7(SYSTEM.observationCategory, "laboratory", "Laboratory", "https://hl7.org/fhir/R4/codesystem-observation-category.html"),
  procedure: hl7(SYSTEM.observationCategory, "procedure", "Procedure", "https://hl7.org/fhir/R4/codesystem-observation-category.html"),
  imaging: hl7(SYSTEM.observationCategory, "imaging", "Imaging", "https://hl7.org/fhir/R4/codesystem-observation-category.html"),
};

export const DATA_ABSENT_NOT_PERFORMED = hl7(
  SYSTEM.dataAbsentReason, "not-performed", "Not Performed", "https://hl7.org/fhir/R4/codesystem-data-absent-reason.html",
);

export const ENCOUNTER_CLASS = {
  inpatient: hl7(SYSTEM.actCode, "IMP", "inpatient encounter", "https://terminology.hl7.org/CodeSystem-v3-ActCode.html"),
  ambulatory: hl7(SYSTEM.actCode, "AMB", "ambulatory", "https://terminology.hl7.org/CodeSystem-v3-ActCode.html"),
};

/**
 * Provenance.activity for an amendment (Week 6 spec §5). Verified 2026-10-16 with tx.fhir.org
 * $lookup: v3-DataOperation 7.0.0, code UPDATE, display "revise", not abstract.
 */
export const DATA_OPERATION = {
  update: hl7(SYSTEM.dataOperation, "UPDATE", "revise",
    "https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v3-DataOperation&code=UPDATE"),
};

export const EMPTY_REASON = {
  nilKnown: hl7(SYSTEM.listEmptyReason, "nilknown", "Nil Known", "https://hl7.org/fhir/R4/codesystem-list-empty-reason.html"),
  notStarted: hl7(SYSTEM.listEmptyReason, "notstarted", "Not Started", "https://hl7.org/fhir/R4/codesystem-list-empty-reason.html"),
};

// ─── Units (UCUM) ──────────────────────────────────────────────────────────────

export const UCUM = {
  percent: "%",
  mmHg: "mm[Hg]",
  perMin: "/min",
  umolPerL: "umol/L",
  egfr: "mL/min/{1.73_m2}",
  gPerDl: "g/dL",
  platelets: "10*9/L",
  mL: "mL",
  min: "min",
  mGy: "mGy",
  gyCm2: "Gy.cm2",
  s: "s",
  mm: "mm",
  atm: "atm",
  month: "mo",
} as const;

/** Medication dose units → UCUM. Heparin "units" are International Units. */
export const DOSE_UNIT_UCUM: Record<Enums["dose_unit"], { code: string; unit: string }> = {
  mg: { code: "mg", unit: "mg" },
  mcg: { code: "ug", unit: "mcg" },
  g: { code: "g", unit: "g" },
  ml: { code: "mL", unit: "mL" },
  iu: { code: "[iU]", unit: "IU" },
  units: { code: "[iU]", unit: "units" },
  units_per_kg: { code: "[iU]/kg", unit: "units/kg" },
};

// ─── Hrudaya-defined identifiers and extensions ────────────────────────────────

export const HRUDAYA = {
  tagSystem: "https://hrudaya.dev/tags",
  mrnSystem: "https://hrudaya.dev/mrn",
  caseCodeSystem: "https://hrudaya.dev/case-code",
  extUrgency: "https://hrudaya.dev/fhir/StructureDefinition/urgency",
  extAccessSite: "https://hrudaya.dev/fhir/StructureDefinition/access-site",
  extDominance: "https://hrudaya.dev/fhir/StructureDefinition/coronary-dominance",
  extDaptPlan: "https://hrudaya.dev/fhir/StructureDefinition/dapt-plan",
} as const;

export const SYNTHETIC_TAG: Coding = {
  system: HRUDAYA.tagSystem,
  code: "synthetic",
  display: "Synthetic data — not a real patient",
};

// ─── Spec suggestions that failed verification (for docs/fhir-mapping.md) ──────

export const REJECTED: { use: string; specCode: string; system: "SNOMED" | "LOINC"; found: string; action: string }[] = [
  { use: "STEMI", specCode: "401314000", system: "SNOMED", found: "Acute non-ST segment elevation myocardial infarction", action: "Used for NSTEMI instead (codes swapped in spec)" },
  { use: "NSTEMI", specCode: "401303003", system: "SNOMED", found: "Acute ST segment elevation myocardial infarction", action: "Used for STEMI instead (codes swapped in spec)" },
  { use: "Positive / abnormal stress test", specCode: "429559004", system: "SNOMED", found: "Typical angina", action: "Text only" },
  { use: "Prior PCI (Condition)", specCode: "415070008", system: "SNOMED", found: "Percutaneous coronary intervention (the procedure)", action: "Text only for the Condition; still used as the Procedure code" },
  { use: "LMCA", specCode: "73208009", system: "SNOMED", found: "Unknown code", action: "Text only" },
  { use: "LCX", specCode: "57396005", system: "SNOMED", found: "Unknown code", action: "Text only (and OM1/OM2, whose parent it is)" },
  { use: "Coronary artery dissection", specCode: "234020005", system: "SNOMED", found: "Vasculitis secondary to drug", action: "Text only" },
  { use: "Creatinine", specCode: "2160-0", system: "LOINC", found: "Creatinine [Mass/volume] — mass, but Hrudaya stores µmol/L", action: "Replaced by 14682-9 (owner approved)" },
  { use: "Activated clotting time", specCode: "3184-5", system: "LOINC", found: "Invalid check digit", action: "Replaced by 3184-9 (owner approved)" },
  { use: "Composition type", specCode: "34896-3", system: "LOINC", found: "Invalid check digit", action: "Replaced by 34896-1 (owner approved)" },
];
