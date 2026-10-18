# Registry mapping (Week 7)

**Hrudaya's 42 registry elements are modelled on NCDR CathPCI v5 concepts and have not been verified against an official NIC data dictionary.** Hrudaya is a synthetic-data project with no registry account. The owner reviews the 42 names before anything is posted publicly.

- The list lives in [`lib/registry/nic-elements.ts`](../lib/registry/nic-elements.ts); `public.registry_completeness(procedure_id)` (migration 0011; element 33 replaced in 0012) computes which are filled, over the same keys in the same order (a unit test holds the two together).
- The report header shows **Registry · n of 42** (tooltip: "modelled on CathPCI v5; NIC mapping pending"). The UI never calls these "NIC fields".
- "CathPCI v5 concept" names the concept, not the dictionary's verbatim element name or sequence number; check the CathPCI v5 Coder's Data Dictionary before citing one.
- An element that does not apply to a case counts as filled (column "Applies when"). An in-hospital outcome left "not recorded" counts as missing — never as "no".
- Hrudaya's procedural-event list (`complications`) is a reporting list, not the registry's; the outcome elements below read `in_hospital_outcomes`, which links back to the events.

| # | Key | Element | CathPCI v5 concept | Entered in | Applies when |
|---|---|---|---|---|---|
| 1 | `patient_date_of_birth` | Date of birth | Birth Date | Capture step 1 | always |
| 2 | `patient_sex` | Sex | Sex | Capture step 1 | always |
| 3 | `admission_at` | Admission date and time | Arrival Date/Time | Capture steps 2 / 5 | always |
| 4 | `indication` | Indication | Indication for Cath Lab Visit / CAD Presentation | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 5 | `urgency` | Urgency | PCI Status (elective / urgent / emergency) | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 6 | `ccs_class` | CCS angina class | CCS Anginal Classification | Indication & outcome sheet — Indication tab (capture step 2) | indication is not STEMI |
| 7 | `nyha_class` | NYHA class | Heart Failure — NYHA Class | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 8 | `cardiogenic_shock` | Cardiogenic shock | Cardiogenic Shock | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 9 | `cardiac_arrest_pre` | Cardiac arrest before the procedure | Cardiac Arrest | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 10 | `prior_pci` | Previous PCI | Prior PCI | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 11 | `prior_cabg` | Previous CABG | Prior CABG | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 12 | `stress_test` | Stress test | Stress Test Performed / Results | Indication & outcome sheet — Indication tab (capture step 2) | indication is not an acute coronary syndrome |
| 13 | `troponin` | Troponin | Cardiac Biomarkers (troponin) | Indication & outcome sheet — Indication tab (capture step 2) | always |
| 14 | `symptom_onset_at` | Symptom onset | Symptom Onset Date/Time | Indication & outcome sheet — Indication tab (capture step 2) | STEMI |
| 15 | `first_medical_contact_at` | First medical contact | First Medical Contact Date/Time | Indication & outcome sheet — Indication tab (capture step 2) | STEMI |
| 16 | `door_at` | Arrival (door) | Arrival at this Facility Date/Time | Indication & outcome sheet — Indication tab (capture step 2) | STEMI |
| 17 | `device_time_at` | First device time | First Device Activation Date/Time | Indication & outcome sheet — Indication tab (capture step 2) | STEMI with PCI |
| 18 | `creatinine_pre` | Creatinine before the procedure | Pre-Procedure Creatinine | Capture steps 2 / 5 | always |
| 19 | `haemoglobin_pre` | Haemoglobin before the procedure | Pre-Procedure Hemoglobin | Capture steps 2 / 5 | always |
| 20 | `lvef_assessed` | LVEF (or not performed) | LVEF Assessed / LVEF % | Haemodynamics & LV sheet (capture step 5) | always |
| 21 | `procedure_start` | Procedure start | Procedure Date/Time | Capture steps 2 / 5 | always |
| 22 | `access_site` | Access site | Arterial Access Site | Capture steps 2 / 5 | always |
| 23 | `primary_operator` | Operator | Operator Name / NPI | Capture steps 2 / 5 | always |
| 24 | `contrast_volume` | Contrast volume | Contrast Volume | Capture steps 2 / 5 | always |
| 25 | `fluoroscopy_time` | Fluoroscopy time | Fluoro Time | Capture steps 2 / 5 | always |
| 26 | `radiation_dose` | Radiation dose (air kerma or DAP) | Cumulative Air Kerma / Dose Area Product | Capture steps 2 / 5 | always |
| 27 | `coronary_dominance` | Coronary dominance | Coronary Circulation Dominance | Capture steps 2 / 5 | always |
| 28 | `coronary_anatomy` | Angiography findings | Native Vessel Stenosis (diagnostic findings) | Lesion sheet (capture step 3) | always |
| 29 | `lesion_class` | Lesion class (treated lesions) | Lesion Complexity (ACC/AHA / SCAI class) | Lesion sheet (capture step 3) | PCI |
| 30 | `lesion_length` | Lesion length (treated lesions) | Lesion Length | Lesion sheet (capture step 3) | PCI |
| 31 | `intermediate_lesion_assessment` | Physiology, imaging or note for a treated 40–69% lesion | FFR / IVUS / OCT performed on lesion | Physiology & imaging sheet | a treated lesion of 40–69% |
| 32 | `pci_techniques` | PCI techniques | Device / technique used per lesion | Intervention & devices sheet (capture step 4) | PCI |
| 33 | `pre_procedure_timi` | Pre-procedure TIMI flow (treated lesions) | Pre-Procedure TIMI Flow | Lesion sheet (capture step 3) — `vessel_findings.timi_flow` on every treated lesion | PCI |
| 34 | `procedure_medications` | Procedure medications | Procedural Medications (anticoagulant / antiplatelet) | Capture steps 2 / 5 | PCI |
| 35 | `outcome_mi` | Periprocedural MI | In-hospital Myocardial Infarction | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 36 | `outcome_stroke` | Stroke | In-hospital Stroke | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 37 | `outcome_death` | Death | Discharge Status — Deceased | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 38 | `outcome_bleeding` | Bleeding | Bleeding Event within 72 hours | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 39 | `outcome_transfusion` | Transfusion | RBC / Whole Blood Transfusion | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 40 | `outcome_vascular` | Vascular complications | Vascular Access Site Complications | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 41 | `outcome_aki` | Acute kidney injury | Acute Kidney Injury (post-procedure creatinine) | Indication & outcome sheet — Outcome tab (capture step 6) | always |
| 42 | `disposition` | Disposition | Discharge Location | Indication & outcome sheet — Outcome tab (capture step 6) | always |

## Owner review (18 Oct 2026)

The owner's reviewer checked the 42 names. One change, made in migration 0012:

- **Element 33: "Guide catheter" → "Pre-procedure TIMI flow (treated lesions)".** The guide
  catheter was a vendor field, not a CathPCI element. The new element reads
  `vessel_findings.timi_flow` on every treated lesion, PCI only, under the CathPCI concept
  "Pre-Procedure TIMI Flow". The total stays 42.
  - `timi_flow` has been NOT NULL (0–3) since migration 0001, so the element is filled for every
    case today. The check is written for the day "not assessed" is allowed.
  - Report counts on PCI cases with no guide catheter recorded went up by one.
  - Undo: `supabase/undo/0012_undo.sql`. The guide catheter is still recorded and shown on the
    report and in FHIR; it is just no longer counted.

**Captured, but deferred to Week 8 with the export.** Three further CathPCI concepts:

| CathPCI concept | Hrudaya | Status |
|---|---|---|
| Risk factors (hypertension, diabetes, dyslipidaemia, smoking, family history, CKD, prior MI…) | `patient_risk_factors` | captured (capture step 1) |
| Discharge medications | `discharge_medications` | captured (discharge) |
| BMI | — | needs height and weight columns (not captured yet) |

They are not counted in "Registry · n of 42" until the Week 8 export defines how each is reported.
