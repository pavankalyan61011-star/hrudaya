# Hrudaya — Week 1 Spec: Data model & procedure capture

> Open-source interventional cardiology procedure record. FHIR R4 + ABDM-ready.
> **Scope (do not expand):** coronary angiography and PCI only. One cath lab. One user role. Synthetic data only — no real patient data, ever.

This document is the source of truth for Week 1. Drop it into the repo at `docs/week1-spec.md`.
The reference case is `docs/cases/PCI-2026-001.md` (your brief, pasted verbatim).

---

## 1. What Week 1 delivers

By end of week:

1. Supabase schema deployed (tables below) with row-level security and audit columns.
2. A logged-in user can enter a full procedure through a 6-step form.
3. A procedure list page and a procedure detail page.
4. Seed script loads PCI-2026-001 plus 19 more synthetic cases.
5. Tested on a phone by Pavan — three cases entered end to end.

Not in Week 1: FHIR export (Week 2), ABDM (Week 3), AI discharge summary (Week 4), design polish (Week 4).

---

## 2. Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Supabase (Mumbai region): Postgres, Auth (email/password), RLS
- Deployed on Vercel
- No ORM beyond the Supabase client. No other backend.

---

## 3. Data model

Everything below maps directly to how a cath lab actually records a case. Every table has `id uuid pk`, `created_at`, `updated_at`, `created_by` (auth user id).

### 3.1 `patients`
| column | type | notes |
|---|---|---|
| mrn | text, unique | hospital record number (synthetic) |
| full_name | text | |
| sex | enum: male, female, other | |
| date_of_birth | date | age is derived, never stored |
| mobile | text, nullable | |
| abha_number | text, nullable | 14-digit; filled in Week 3 |
| abha_address | text, nullable | e.g. `name@abdm`; Week 3 |
| is_synthetic | boolean, default true | always true in this project |

### 3.2 `patient_risk_factors`
One row per risk factor so they are queryable.
| column | type | notes |
|---|---|---|
| patient_id | fk patients | |
| factor | enum: hypertension, diabetes_t2, diabetes_t1, dyslipidaemia, smoking, ex_smoker, family_history, ckd, obesity, prior_pci, prior_cabg, prior_mi, other | |
| detail | text, nullable | e.g. "10 years", "20 pack-years" |

### 3.3 `operators`
| column | type | notes |
|---|---|---|
| full_name | text | |
| role | enum: interventional_cardiologist, fellow, cath_lab_technologist, nurse | |
| hpr_id | text, nullable | Health Professional Registry id; later |

### 3.4 `procedures`
The core record. One row per cath lab visit.
| column | type | notes |
|---|---|---|
| patient_id | fk patients | |
| case_code | text, unique | e.g. PCI-2026-001 |
| procedure_date | date | |
| procedure_type | enum: diagnostic_angiography, pci, angiography_and_pci | |
| indication | enum: stemi, nstemi, unstable_angina, stable_angina, positive_stress_test, pre_op_assessment, cardiomyopathy_workup, other | |
| presentation_notes | text | free text: the story ("central chest pain radiating to left arm for 2 days…") |
| ecg_findings | text, nullable | "ST depression V4–V6" |
| troponin_elevated | boolean, nullable | |
| access_site | enum: right_radial, left_radial, right_femoral, left_femoral, right_ulnar, left_ulnar, other | |
| sheath_size_fr | integer | 5, 6, 7, 8 |
| diagnostic_catheters | text[] | ["5F TIG"] |
| guiding_catheter | text, nullable | "6F EBU 3.5" |
| contrast_volume_ml | integer | |
| procedure_duration_min | integer | |
| fluoroscopy_time_min | numeric(5,1) | |
| radiation_dose_mgy | numeric, nullable | optional |
| primary_operator_id | fk operators | |
| haemostasis_method | enum: radial_compression_band, manual_compression, vascular_closure_device, other | |
| outcome_summary | text | the "final impression" paragraph |
| status | enum: draft, completed | |

### 3.5 `vessel_findings`
One row per vessel/segment seen on angiography.
| column | type | notes |
|---|---|---|
| procedure_id | fk procedures | |
| vessel | enum: lmca, lad, d1, d2, lcx, om1, om2, ramus, rca, pda, plv, graft, other | |
| segment | enum: ostial, proximal, mid, distal, nullable | |
| stenosis_pct | integer 0–100 | 0 = normal |
| timi_flow | integer 0–3 | pre-intervention |
| is_culprit | boolean | |
| lesion_notes | text, nullable | calcification, bifurcation, thrombus, etc. |

### 3.6 `interventions`
One row per treated lesion.
| column | type | notes |
|---|---|---|
| procedure_id | fk procedures | |
| vessel_finding_id | fk vessel_findings | the lesion treated |
| intervention_type | enum: pci_des, pci_bms, poba, drug_coated_balloon, thrombectomy, rotational_atherectomy, other | |
| guidewire | text | "BMW Universal II 0.014" |
| residual_stenosis_pct | integer 0–100 | |
| timi_flow_post | integer 0–3 | |
| success | boolean | |
| dissection | boolean, default false | |
| perforation | boolean, default false | |
| notes | text, nullable | |

### 3.7 `devices_used`
Every implant and balloon, with lot number — this is the traceability table.
| column | type | notes |
|---|---|---|
| intervention_id | fk interventions | |
| phase | enum: pre_dilation, deployment, post_dilation, other | |
| category | enum: stent, balloon_sc, balloon_nc, guidewire, other | |
| product_name | text | "Xience Skypoint DES" |
| manufacturer | text, nullable | |
| diameter_mm | numeric(4,2) | 3.5 |
| length_mm | numeric(5,1) | 28 |
| inflation_atm | integer, nullable | 14 |
| lot_number | text, nullable | required when category = stent |
| expiry_date | date, nullable | |
| udi | text, nullable | Unique Device Identifier, if printed on box |
| quantity | integer, default 1 | |

### 3.8 `complications`
Zero rows = no complications.
| column | type | notes |
|---|---|---|
| procedure_id | fk procedures | |
| complication | enum: dissection, perforation, no_reflow, access_site_haematoma, radial_occlusion, contrast_nephropathy, arrhythmia, cardiac_tamponade, stroke, death, other | |
| severity | enum: minor, major | |
| management | text | |

### 3.9 `discharges`
One per procedure.
| column | type | notes |
|---|---|---|
| procedure_id | fk procedures, unique | |
| discharge_date | date | |
| length_of_stay_hours | integer | |
| clinical_status | text | "clinically stable" |
| follow_up_date | date | |
| follow_up_clinic | text | "Cardiology OPD" |
| advice | text[] | ["Strict DAPT adherence", "Smoking cessation", …] |
| red_flags | text[] | ["Recurrent chest pain", "Severe breathlessness", "Significant bleeding"] |

### 3.10 `discharge_medications`
| column | type | notes |
|---|---|---|
| discharge_id | fk discharges | |
| drug_name | text | "Ticagrelor" |
| dose | numeric | 90 |
| dose_unit | enum: mg, mcg, g, ml, iu | |
| frequency | enum: od, bd, tds, qds, prn, weekly | |
| route | enum: oral, sc, iv, topical, default oral | |
| duration | text, nullable | "12 months" |
| purpose | text, nullable | "antiplatelet" |
| is_dapt | boolean, default false | aspirin + P2Y12 — drives the Week 4 adherence messaging |

### 3.11 Audit
Every table: `created_by uuid references auth.users`, `created_at timestamptz default now()`, `updated_at timestamptz` via trigger. A `procedure_events` log table (procedure_id, event, actor, at) records status changes.

### 3.12 RLS (Week 1 — single role)
All tables: `select/insert/update` allowed for any authenticated user. No delete from the UI. Tighten in Week 4.

---

## 4. Reference case mapped to the model

PCI-2026-001 →
- patients: 1 row (58M, synthetic MRN)
- patient_risk_factors: hypertension (10 yrs), diabetes_t2 (8 yrs), dyslipidaemia, smoking (20 pack-years)
- operators: Dr Arjun Reddy, interventional_cardiologist
- procedures: nstemi, right_radial, 6F, ["5F TIG"], "6F EBU 3.5", 110 ml, 55 min, 12.5 min fluoro, radial_compression_band
- vessel_findings: lmca 0/III; lad proximal 90/II culprit; lcx mid 40/III; rca proximal 30/III
- interventions: lad lesion, pci_des, "BMW Universal II 0.014", residual 0, timi_post 3, success
- devices_used: pre_dilation balloon_sc 2.5×15 @12 atm; deployment stent Xience Skypoint 3.5×28 @14 atm lot SYN-XSP-260184; post_dilation balloon_nc 3.75×12 @18 atm
- complications: none
- discharges: 48 h, follow-up +14 days Cardiology OPD, advice ×5, red_flags ×3
- discharge_medications: Aspirin 75 od (dapt), Ticagrelor 90 bd (dapt), Atorvastatin 80 od, Metoprolol 25 bd, Pantoprazole 40 od

---

## 5. Capture form — 6 steps

Each step saves on "Next" (procedure stays `draft` until step 6 completes). Dropdowns everywhere an enum exists; free text only where listed.

1. **Patient** — search existing by MRN/name or create new; risk factors as checkboxes with optional detail.
2. **Indication & access** — procedure type, indication, presentation notes, ECG, troponin, access site, sheath, catheters, operator.
3. **Angiography** — table with one row per vessel: vessel, segment, stenosis %, TIMI, culprit toggle, notes. "Add vessel" button. Pre-fill LMCA/LAD/LCX/RCA rows.
4. **Intervention & devices** — pick the culprit lesion; intervention type; guidewire; then device rows grouped by phase (pre-dilation / stent / post-dilation) with size, atm, lot number. Lot number required for stents. Residual stenosis and TIMI post.
5. **Procedure details & complications** — contrast, duration, fluoro, haemostasis, complications (default none).
6. **Discharge** — length of stay, status, medications (quick-add buttons for common DAPT regimens), advice checklist, red flags checklist, follow-up date. "Complete procedure" sets status = completed.

Pages: `/procedures` (list: case code, date, patient, indication, status), `/procedures/[id]` (full read-only record laid out like a cath report), `/procedures/new`.

---

## 6. Seed data

`scripts/seed.ts` inserts PCI-2026-001 exactly as above, plus 19 more synthetic cases Pavan writes (short form is fine). Aim for variety:
- 6 NSTEMI, 5 STEMI (primary PCI), 4 stable angina, 3 diagnostic-only (no intervention), 2 with a complication
- At least 3 multi-vessel, 2 femoral access, 2 with two stents, 1 with a drug-coated balloon
- Every stent has a fictional lot number prefixed `SYN-`

---

## 7. Definition of done (Week 1)

- [ ] Schema migration runs clean on a fresh Supabase project
- [ ] Seed loads 20 cases without error
- [ ] New procedure can be entered start to finish on a phone in under 8 minutes
- [ ] Detail page reads like a real cath report
- [ ] Deployed on Vercel behind Supabase email login
- [ ] README has the scope statement and a "synthetic data only" notice
- [ ] 60-second Friday progress video recorded

---

## 8. First Claude Code prompt

Paste this into Claude Code from the empty `hrudaya` repo after creating the Supabase project and setting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

```
You are building Hrudaya, an open-source interventional cardiology procedure record for Indian cath labs. Read docs/week1-spec.md and docs/cases/PCI-2026-001.md first — the spec is the source of truth.

Scope: coronary angiography and PCI only. Synthetic data only. Do not add features beyond the spec.

Stack: Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + Auth + RLS). No ORM, no other backend. Target deploy: Vercel.

Build, in this order, committing after each step:

1. Scaffold the Next.js app with Tailwind and the Supabase client (server and browser helpers). Email/password auth with a /login page; all /procedures routes require auth.

2. Write the Supabase migration in supabase/migrations/0001_init.sql implementing every table, enum, constraint, audit column, updated_at trigger and RLS policy in section 3 of the spec. Use Postgres enums for every enum listed. Add a procedure_events table. Run it against the project.

3. Generate TypeScript types from the schema into lib/database.types.ts.

4. Write scripts/seed.ts that inserts the reference case PCI-2026-001 exactly as mapped in section 4 of the spec, plus a clearly marked placeholder array for 19 more cases that I will fill in. Make it idempotent (safe to re-run).

5. Build the 6-step capture form at /procedures/new as described in section 5. Each step saves on Next. Dropdowns for every enum. Lot number is required when a device is a stent. Pre-fill the four main vessels in the angiography step. Mobile-first layout — it will be tested on a phone.

6. Build /procedures (list) and /procedures/[id] (read-only detail laid out like a cath report: patient, presentation, access, angiography table, intervention and devices, procedure details, complications, discharge and medications).

7. Write README.md: one-paragraph description, scope statement, "synthetic data only" notice, local setup, and a roadmap listing Week 2 FHIR export, Week 3 ABDM, Week 4 AI discharge summary.

Rules: keep components small; put all Supabase queries in lib/queries/; no client-side service-role key; never log patient data; ask me before adding any dependency beyond Next, Supabase, Tailwind and Zod. When finished, give me a checklist of what to test on my phone.
```

---

## 9. What Pavan does this week

- Day 1: create GitHub repo, Supabase project, Vercel project; paste spec + case into docs/; run the prompt above.
- Day 2–3: test each form step on phone as Claude Code delivers it; report bugs in plain language ("the stent lot number field disappears when I pick balloon").
- Day 3–4: write the 19 short synthetic cases (5–8 lines each).
- Day 5: enter 3 cases by hand end to end; record the 60-second video; post it.
