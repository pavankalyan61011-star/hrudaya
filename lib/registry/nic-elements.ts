/**
 * The registry element list behind "NIC registry · n of 42" (Week 7 spec §2.12, §3.7).
 *
 * Same keys, in the same order, as public.registry_completeness (migration 0011, element 33
 * replaced in 0012), which computes
 * which of them a procedure has filled; lib/registry/nic-elements.seeded.test.ts checks the two
 * agree. Week 8 builds the export from this list.
 *
 * Provenance — read before quoting:
 *  - This is Hrudaya's working list of the elements an Indian national PCI registry (National
 *    Interventional Council, NIC) collects, modelled on the NCDR CathPCI Registry v5 element set,
 *    which NIC's form borrows from. Hrudaya is a synthetic-data project with no registry account,
 *    so the list has NOT been checked against an official NIC data dictionary.
 *  - `ncdr` names the CathPCI v5 concept each element corresponds to, as a concept name, not the
 *    dictionary's verbatim element name or sequence number. Check against the CathPCI v5 Coder's
 *    Data Dictionary before citing (docs/registry-mapping.md, Week 7 spec §6).
 *  - An element that does not apply to a case counts as filled (`appliesWhen`); an outcome left
 *    "not recorded" counts as missing — never as "no".
 *
 * Type-only imports, so it runs under Node as well as in Next.
 */

/** Where the value is entered: the report-page sheet (§3) or capture step that holds it. */
export type RegistrySheet =
  | "patient"        // capture step 1
  | "indication"     // §3.6 Indication tab (capture step 2)
  | "procedure"      // capture step 2 / 5 (access, contrast, radiation, operator)
  | "lesion"         // §3.1 Lesion sheet
  | "physiology"     // §3.2 Physiology & imaging sheet
  | "haemodynamics"  // §3.3 Haemodynamics & LV sheet
  | "intervention"   // §3.5 Intervention & devices sheet
  | "outcome";       // §3.6 Outcome tab

export type RegistryElement = {
  key: string;
  label: string;
  sheet: RegistrySheet;
  /** NCDR CathPCI v5 concept (not verbatim; see the header). */
  ncdr: string;
  /** When the element applies; otherwise it counts as filled. Omitted = always. */
  appliesWhen?: string;
};

export const NIC_ELEMENTS: readonly RegistryElement[] = [
  // Patient and admission
  { key: "patient_date_of_birth", label: "Date of birth", sheet: "patient", ncdr: "Birth Date" },
  { key: "patient_sex", label: "Sex", sheet: "patient", ncdr: "Sex" },
  { key: "admission_at", label: "Admission date and time", sheet: "procedure", ncdr: "Arrival Date/Time" },
  // History and presentation
  { key: "indication", label: "Indication", sheet: "indication", ncdr: "Indication for Cath Lab Visit / CAD Presentation" },
  { key: "urgency", label: "Urgency", sheet: "indication", ncdr: "PCI Status (elective / urgent / emergency)" },
  { key: "ccs_class", label: "CCS angina class", sheet: "indication", ncdr: "CCS Anginal Classification", appliesWhen: "indication is not STEMI" },
  { key: "nyha_class", label: "NYHA class", sheet: "indication", ncdr: "Heart Failure — NYHA Class" },
  { key: "cardiogenic_shock", label: "Cardiogenic shock", sheet: "indication", ncdr: "Cardiogenic Shock" },
  { key: "cardiac_arrest_pre", label: "Cardiac arrest before the procedure", sheet: "indication", ncdr: "Cardiac Arrest" },
  { key: "prior_pci", label: "Previous PCI", sheet: "indication", ncdr: "Prior PCI" },
  { key: "prior_cabg", label: "Previous CABG", sheet: "indication", ncdr: "Prior CABG" },
  { key: "stress_test", label: "Stress test", sheet: "indication", ncdr: "Stress Test Performed / Results", appliesWhen: "indication is not an acute coronary syndrome" },
  { key: "troponin", label: "Troponin", sheet: "indication", ncdr: "Cardiac Biomarkers (troponin)" },
  { key: "symptom_onset_at", label: "Symptom onset", sheet: "indication", ncdr: "Symptom Onset Date/Time", appliesWhen: "STEMI" },
  { key: "first_medical_contact_at", label: "First medical contact", sheet: "indication", ncdr: "First Medical Contact Date/Time", appliesWhen: "STEMI" },
  { key: "door_at", label: "Arrival (door)", sheet: "indication", ncdr: "Arrival at this Facility Date/Time", appliesWhen: "STEMI" },
  { key: "device_time_at", label: "First device time", sheet: "indication", ncdr: "First Device Activation Date/Time", appliesWhen: "STEMI with PCI" },
  // Pre-procedure assessment
  { key: "creatinine_pre", label: "Creatinine before the procedure", sheet: "procedure", ncdr: "Pre-Procedure Creatinine" },
  { key: "haemoglobin_pre", label: "Haemoglobin before the procedure", sheet: "procedure", ncdr: "Pre-Procedure Hemoglobin" },
  { key: "lvef_assessed", label: "LVEF (or not performed)", sheet: "haemodynamics", ncdr: "LVEF Assessed / LVEF %" },
  // Procedure
  { key: "procedure_start", label: "Procedure start", sheet: "procedure", ncdr: "Procedure Date/Time" },
  { key: "access_site", label: "Access site", sheet: "procedure", ncdr: "Arterial Access Site" },
  { key: "primary_operator", label: "Operator", sheet: "procedure", ncdr: "Operator Name / NPI" },
  { key: "contrast_volume", label: "Contrast volume", sheet: "procedure", ncdr: "Contrast Volume" },
  { key: "fluoroscopy_time", label: "Fluoroscopy time", sheet: "procedure", ncdr: "Fluoro Time" },
  { key: "radiation_dose", label: "Radiation dose (air kerma or DAP)", sheet: "procedure", ncdr: "Cumulative Air Kerma / Dose Area Product" },
  { key: "coronary_dominance", label: "Coronary dominance", sheet: "procedure", ncdr: "Coronary Circulation Dominance" },
  // Lesions and PCI
  { key: "coronary_anatomy", label: "Angiography findings", sheet: "lesion", ncdr: "Native Vessel Stenosis (diagnostic findings)" },
  { key: "lesion_class", label: "Lesion class (treated lesions)", sheet: "lesion", ncdr: "Lesion Complexity (ACC/AHA / SCAI class)", appliesWhen: "PCI" },
  { key: "lesion_length", label: "Lesion length (treated lesions)", sheet: "lesion", ncdr: "Lesion Length", appliesWhen: "PCI" },
  { key: "intermediate_lesion_assessment", label: "Physiology, imaging or note for a treated 40–69% lesion", sheet: "physiology", ncdr: "FFR / IVUS / OCT performed on lesion", appliesWhen: "a treated lesion of 40–69%" },
  { key: "pci_techniques", label: "PCI techniques", sheet: "intervention", ncdr: "Device / technique used per lesion", appliesWhen: "PCI" },
  // 0012 (owner, 2026-10-18): replaced "Guide catheter" (a vendor field, not a CathPCI element).
  { key: "pre_procedure_timi", label: "Pre-procedure TIMI flow (treated lesions)", sheet: "lesion", ncdr: "Pre-Procedure TIMI Flow", appliesWhen: "PCI" },
  { key: "procedure_medications", label: "Procedure medications", sheet: "procedure", ncdr: "Procedural Medications (anticoagulant / antiplatelet)", appliesWhen: "PCI" },
  // In-hospital outcomes ("not recorded" is missing)
  { key: "outcome_mi", label: "Periprocedural MI", sheet: "outcome", ncdr: "In-hospital Myocardial Infarction" },
  { key: "outcome_stroke", label: "Stroke", sheet: "outcome", ncdr: "In-hospital Stroke" },
  { key: "outcome_death", label: "Death", sheet: "outcome", ncdr: "Discharge Status — Deceased" },
  { key: "outcome_bleeding", label: "Bleeding", sheet: "outcome", ncdr: "Bleeding Event within 72 hours" },
  { key: "outcome_transfusion", label: "Transfusion", sheet: "outcome", ncdr: "RBC / Whole Blood Transfusion" },
  { key: "outcome_vascular", label: "Vascular complications", sheet: "outcome", ncdr: "Vascular Access Site Complications" },
  { key: "outcome_aki", label: "Acute kidney injury", sheet: "outcome", ncdr: "Acute Kidney Injury (post-procedure creatinine)" },
  { key: "disposition", label: "Disposition", sheet: "outcome", ncdr: "Discharge Location" },
] as const;

export const NIC_TOTAL = NIC_ELEMENTS.length; // 42

export const nicElement = (key: string) => NIC_ELEMENTS.find((e) => e.key === key);
