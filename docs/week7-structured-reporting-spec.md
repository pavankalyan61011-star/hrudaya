# Hrudaya — Week 7 Spec: Complete structured reporting fields

> Goal: every field a vendor cath report captures — and every field the NIC and NCDR CathPCI registries ask for — can be recorded in Hrudaya, in the same place a clinician would look for it, with its source. Lesion morphology, physiology (FFR/iFR), intravascular imaging (IVUS/OCT/NIRS), left-heart haemodynamics, LV function detail, bypass grafts, technique and bifurcation strategy, inflation log, indication detail (CCS/NYHA/STEMI timings), procedural events with their treatment, and in-hospital outcomes recorded as yes / no / not recorded. Right-heart, valve and shunt reporting are deferred (backlog) — they are beyond the coronary MVP.
> Why: Weeks 1–6 built a correct record with a strong spine (patient → findings → interventions → devices → complications → discharge). Compared field-by-field with syngo Dynamics, Merge Cardio, Philips and Change/Optum structured reporting (all mapped to NCDR CathPCI v5), Hrudaya is at roughly 60% of the element set. The missing 40% is what hospital IT and registry coordinators check first, and what an interventional cardiologist expects to be able to write down. This week closes that gap **without turning the UI into a 40-field form**: every new group is a side sheet opened from the thing it describes.

Drop this at `docs/week7-structured-reporting-spec.md`. Read `docs/week1-spec.md` §3 (tables, three-state `measurement_status` rule), `supabase/migrations/0005_dapt_meds_signoff_times.sql` (`guard_reviewed_child`), `0007_safety_access_communication_measurements.sql` (how optional measurements are modelled), and `docs/fhir-mapping.md` §1 first.

## 0. Why this week matters (read this, Pavan)

Three reasons this is the right week now:

1. **Interviews.** "Which registry element sets have you worked with?" is a standard clinical-application / implementation question. After this week you can say: "I mapped Hrudaya to the NIC registry and NCDR CathPCI v5 element sets, field by field, and built the capture for all of them." That is a sentence very few candidates can say.
2. **The prototype and the live app must agree.** The Claude Design prototype shows lesion detail sheets, physiology, IVUS values, haemodynamics, grafts, outcomes. The live app does not have them. Anyone who clicks from the prototype to hrudaya.vercel.app will notice.
3. **Everything downstream gets better for free.** The AI summary, the FHIR bundle, the generated narrative (Week 8) and the registry export (Week 8) all read from these tables. Fill the tables now; the later weeks become mapping, not modelling.

What this week is **not**: no viewer, no QCA, no machine feeds. Every value this week is typed or picked. The schema is designed so that Weeks 11–12 can later write the same columns with a different `source`.

## 1. What Week 7 delivers

- Migration `0011_structured_reporting.sql` — additive only; nothing existing is renamed or dropped.
- Lesion detail: morphology columns on `vessel_findings`; new `lesion_physiology` and `intravascular_imaging` tables (one row per measurement, pre or post).
- `haemodynamics` table — left heart only this week (Ao, LV, LVEDP), with the three-state rule. Right heart, valves, cardiac output and shunts go to `docs/backlog.md` as "Week 7b — haemodynamics beyond coronary".
- LV function detail on `procedures` + `lv_wall_motion` table (17-segment).
- `grafts` table for post-CABG anatomy; graft lesions reference a graft row.
- Technique chips (incl. POBA, POT/re-POT, advanced techniques, other + description), a separate bifurcation-strategy picker, and dissection/perforation grading on `interventions`; `device_inflations` table (inflation log per device).
- `complications` extended into a full procedural-event list (closure, stent thrombosis, embolism, spasm, arrhythmia, arrest, new shock, contrast reaction, pulmonary oedema, unplanned repeat PCI) with **treatment and resolution per event**.
- Indication detail on `procedures`: CCS, NYHA, stress test, STEMI timings (door-to-device derived, never stored), shock, arrest.
- `in_hospital_outcomes` table (one row per procedure): MI, stroke, death, AKI, transfusion and the rest recorded as **yes / no / not recorded** (never defaulted to "no"); vascular complications as a multi-select; each outcome can point at the procedural event(s) that caused it, so nothing is entered twice.
- Measurement traceability: every physiology, imaging and QCA-reserved value can carry the lesion, the image (study/series/instance UID), the frame, the phase and the method, so a viewer result stays traceable (agreed with Amar as the integration contract).
- A `source` enum on every clinical value table: `typed`, `picked`, `scanned`, `measured_viewer`, `pullback`, `hemo_system`, `xray_dose`, `phone`, `generated`. Week 7 writes only `typed` / `picked`.
- UI: six **side sheets** opened from the report page — Lesion, Physiology & imaging, Haemodynamics & LV, Grafts, Intervention & devices, Indication & outcome — plus the existing capture-form steps gaining the same fields in the same order. Every field optional unless marked *registry*; a registry-completeness count appears on the report header.
- FHIR: new Observations for every new measurement with verified LOINC/SNOMED codes; Procedure.usedCode for technique; BodyStructure not used — lesion site stays as Observation.bodySite (keeps the Week 2 shape).
- AI summary prompt v7: may mention FFR/iFR, IVUS result, LVEF, outcomes — audited against the same tables; still forbidden from inventing values.
- Seed: the 21 synthetic cases gain plausible values for the new fields (not all cases all fields — realistic sparsity), including one post-CABG case with grafts, two STEMI with timings, one FFR-deferred lesion (right-heart cath deferred to Week 7b, §2.5 / §6).

## 2. Data model — migration 0011 (additive)

All new tables: `id uuid pk`, `procedure_id fk procedures` (or the parent noted), `source public.value_source not null default 'typed'`, `recorded_by fk auth.users`, `recorded_at timestamptz default now()`, `notes text null`. All are covered by `guard_reviewed_child` (read-only once the procedure is `reviewed`, editable during `amending`) and by the Week 6 snapshot/diff — **extend `procedure_snapshot` to include every new table** so amendments list changes to them.

### 2.1 `value_source` enum
`typed, picked, scanned, measured_viewer, pullback, hemo_system, xray_dose, phone, generated`. Week 7 code writes `typed` for free entry and `picked` for enum/button pickers. Other values are reserved.

### 2.2 `vessel_findings` — new columns
| column | type | notes |
|---|---|---|
| lesion_class | enum: a, b1, b2, c, nullable | ACC/AHA lesion classification |
| ostial | boolean, default false | |
| bifurcation_medina | text, nullable; check `~ '^[01],[01],[01]$'` | present only when `bifurcation = true` |
| tortuosity | enum: none, moderate, severe, nullable | |
| cto | boolean, default false | chronic total occlusion |
| cto_duration_months | integer ≥ 0, nullable | present only when `cto = true` |
| in_stent_restenosis | boolean, default false | |
| isr_pattern | enum: focal, diffuse, proliferative, occlusive, nullable | present only when `in_stent_restenosis = true` |
| collaterals_rentrop | integer 0–3, nullable | |
| timi_frame_count | integer ≥ 0, nullable | corrected TIMI frame count, pre |
| graft_id | fk grafts, nullable | when `vessel = graft`, the graft this lesion sits in |
| stenosis_source | value_source, default 'typed' | `measured_viewer` reserved for Week 12 |
| mld_mm | numeric(4,2), nullable | reserved: minimum lumen diameter from QCA |
| rvd_mm | numeric(4,2), nullable | reserved: reference vessel diameter from QCA |
| measurement_method | enum: visual, qca_manual_edge, qca_auto_edge, nullable | how `stenosis_pct` was obtained |
| image_study_uid / image_series_uid / image_instance_uid | text, nullable | DICOM UIDs of the image the measurement was made on (reserved for Weeks 11–12) |
| image_frame | integer, nullable | frame number within the cine |
| image_view | text, nullable | "LAO 45 CAU 25" |

**Traceability contract (agree with Amar):** every measured value — here, in `lesion_physiology`, in `intravascular_imaging` — identifies (1) the lesion (`vessel_finding_id`), (2) the image by DICOM UIDs, (3) the frame, (4) the phase pre/post, (5) the method, and (6) the `source`. A viewer or QCA module that cannot supply 1–5 writes nothing.

Rule: `stenosis_pct = 100` ⇒ `cto` or `thrombus` or `timi_flow = 0` should be true — warn in UI, do not block.

### 2.3 `lesion_physiology`
One row per pressure-wire measurement on a lesion (pre and post are separate rows).
| column | type | notes |
|---|---|---|
| vessel_finding_id | fk vessel_findings | |
| phase | enum: pre, post | |
| index | enum: ffr, ifr, rfr, dfr, pd_pa_rest | which index |
| value | numeric(3,2) 0.00–1.00 | |
| hyperaemic_agent | enum: adenosine_iv, adenosine_ic, papaverine, regadenoson, none, nullable | none for resting indices |
| agent_dose | text, nullable | "140 µg/kg/min" |
| decision | enum: defer, treat, nullable | the clinical call this value supported |
| image_study_uid / image_series_uid | text, nullable | pressure-wire pullback or angiographic reference, when available |
| method | enum: pressure_wire, angiography_derived, nullable | angiography-derived (QFR-type) reserved; licence required |
*registry*: for a lesion with stenosis 40–69% that is treated, a physiology row or an imaging row or a `lesion_notes` justification should exist — warn only.

### 2.4 `intravascular_imaging`
One row per pullback.
| column | type | notes |
|---|---|---|
| vessel_finding_id | fk vessel_findings | |
| modality | enum: ivus, oct, nirs_ivus | |
| phase | enum: pre, post | |
| mla_mm2 | numeric(5,2), nullable | minimum lumen area |
| eem_area_mm2 | numeric(5,2), nullable | vessel (EEM) area at MLA |
| plaque_burden_pct | integer 0–100, nullable | |
| calcium_arc_deg | integer 0–360, nullable | |
| calcium_thickness_mm | numeric(4,2), nullable | OCT |
| lipid_arc_deg | integer 0–360, nullable | OCT |
| max_lcbi_4mm | integer 0–1000, nullable | NIRS only |
| msa_mm2 | numeric(5,2), nullable | post: minimum stent area |
| stent_expansion_pct | integer 0–150, nullable | post |
| malapposition | boolean, nullable | post |
| edge_dissection | boolean, nullable | post |
| pullback_length_mm | integer, nullable | |
| image_study_uid / image_series_uid / image_instance_uid | text, nullable | the pullback study; frame of the MLA in `mla_frame integer null` |
| method | enum: manual, vendor_auto, nullable | how the areas were traced |

### 2.5 `haemodynamics`
At most one row per procedure. Each block has its own `measurement_status` (`not_recorded`, `not_performed`, `recorded`) following the Week 1 three-state rule: values present exactly when the block is `recorded`.
| column | type | notes |
|---|---|---|
| left_status | measurement_status, default not_recorded | |
| ao_systolic / ao_diastolic / ao_mean | integer mmHg, nullable | supersedes `procedures.aortic_pressure_*`; migration copies existing values across and leaves the old columns in place for Week 2 FHIR until the mapper is switched |
| lv_systolic | integer, nullable | |
| lv_edp | integer, nullable | copies `procedures.lvedp_mmhg` when recorded |
| heart_rate_at_measurement | integer, nullable | |

**Deferred (backlog, "Week 7b"):** right-heart block (RA, RV, PA, PCWP, CO/CI, PVR/SVR, mixed venous sat, Qp:Qs), valve gradients/areas block. The table is designed so those arrive as additional `*_status` blocks without renaming anything.
| rhythm | enum: sinus, af, paced, other, nullable | |

### 2.6 LV function — `procedures` new columns + `lv_wall_motion`
`procedures`: `lv_function_source` already exists as `lvef_source`; add `mitral_regurgitation_grade integer 0–4 null`, `lv_gram_performed boolean null`.
`lv_wall_motion`: one row per abnormal segment (absence = normal). `segment integer 1–17` (AHA model), `motion enum: hypokinetic, akinetic, dyskinetic, aneurysmal`.

### 2.7 `grafts`
| column | type | notes |
|---|---|---|
| graft_type | enum: lima, rima, svg, radial, gastroepiploic, other | |
| target_vessel | vessel enum (reuse) | native vessel it supplies |
| sequential | boolean, default false | |
| patency | enum: patent, stenosed, occluded, not_visualised | |
| stenosis_pct | integer 0–100, nullable | present when stenosed |
| lesion_location | enum: ostial, body, distal_anastomosis, nullable | |
| cabg_year | integer, nullable | |

`vessel_findings.vessel = graft` rows must set `graft_id`. The tree UI (Week 8) draws grafts as extra branches.

### 2.8 `interventions` — new columns
| column | type | notes |
|---|---|---|
| techniques | technique[] | enum array: poba (plain balloon angioplasty), predilation, direct_stent, post_dilation, pot (proximal optimisation), re_pot, kissing_balloon, thrombectomy, rotational_atherectomy, orbital_atherectomy, intravascular_lithotripsy, laser_atherectomy, cutting_balloon, scoring_balloon, drug_coated_balloon, cto_antegrade, cto_retrograde, bailout_stent, other |
| technique_other | text, nullable | required when `techniques` contains `other` |
| bifurcation_strategy | enum: provisional, t_tap, culotte, dk_crush, mini_crush, simultaneous_kissing_stents, other, nullable | separate from `kissing_balloon`; shown only when the treated lesion has `bifurcation = true` (European Bifurcation Club terminology) |
| bifurcation_strategy_other | text, nullable | |
| guiding_catheter | text, nullable | per intervention; falls back to `procedures.guiding_catheter` |
| wires | text[] | replaces single `guidewire` over time; migration copies `guidewire` into `wires[1]`, keeps `guidewire` |
| dissection_grade | enum: a, b, c, d, e, f, nullable | present only when `dissection = true` (NHLBI) |
| perforation_class | enum: ellis_1, ellis_2, ellis_3, ellis_3_cavity, nullable | present only when `perforation = true` |
| no_reflow | boolean, default false | |
| failure_reason | enum: unable_to_cross, unable_to_dilate, unable_to_deliver, complication, other, nullable | present only when `success = false` |
| stent_overlap | boolean, default false | |
| total_stent_length_mm | numeric(5,1), nullable | derived in UI from devices, stored because operator may correct |

### 2.8a `complications` — becomes the procedural-event list
Extend the existing enum and add treatment/resolution. Zero rows still means no events.
| column | type | notes |
|---|---|---|
| complication | enum, extended: dissection, perforation, no_reflow, **side_branch_closure, abrupt_vessel_closure, acute_stent_thrombosis, distal_embolisation, air_embolism, coronary_spasm, cardiac_arrest, new_cardiogenic_shock, contrast_reaction, pulmonary_oedema, unplanned_repeat_pci**, access_site_haematoma, radial_occlusion, contrast_nephropathy, cardiac_tamponade, stroke, death, other | |
| onset_at | timestamptz, nullable | existing column (0007) is the event time — no separate `occurred_at` (owner, 2026-10-18); arrhythmia uses the existing `arrhythmia` value with its type in `grade` |
| grade | text, nullable | dissection A–F, perforation Ellis class, arrhythmia type (VF / VT / complete heart block / AF with compromise) — validated per `complication` in the UI |
| treatments | event_treatment[] | enum array: none, additional_stent, covered_stent, prolonged_balloon_inflation, intracoronary_vasodilator, thrombus_aspiration, gp_iib_iiia, defibrillation, cardioversion, temporary_pacing, pericardiocentesis, iabp, impella_or_ecmo, intubation, emergency_cabg, repeat_pci, transfusion, dialysis, other |
| treatment_other | text, nullable | |
| resolution | enum: resolved, ongoing_at_discharge, fatal, nullable | |
| outcome | text, nullable | existing free text, kept |
Procedural events are the single source for "what happened"; in-hospital outcomes (2.11) **reference** them rather than restating them.

### 2.9 `device_inflations`
One row per inflation of a balloon or stent delivery system.
| column | type | notes |
|---|---|---|
| device_id | fk devices_used | |
| sequence | integer ≥ 1 | |
| pressure_atm | integer | |
| duration_s | integer, nullable | |
`devices_used.inflation_atm` stays as "nominal/max" and the UI shows the log beneath it.

### 2.10 Indication detail — `procedures` new columns
| column | type | notes |
|---|---|---|
| ccs_class | integer 1–4, nullable | angina class |
| nyha_class | integer 1–4, nullable | |
| stress_test_type | enum: tmt, stress_echo, spect, pet, cmr, ct_ffr, none, nullable | |
| stress_test_result | enum: positive, negative, equivocal, nullable | |
| cardiogenic_shock | boolean, default false | |
| cardiac_arrest_pre_procedure | boolean, default false | |
| symptom_onset_at | timestamptz, nullable | STEMI |
| first_medical_contact_at | timestamptz, nullable | STEMI |
| door_at | timestamptz, nullable | STEMI arrival |
| device_time_at | timestamptz, nullable | first device / wire crossing |
| thrombolysis_given | boolean, default false | |
| prior_pci | boolean, nullable | |
| prior_cabg | boolean, nullable | |
Door-to-device minutes are **derived** (`device_time_at − door_at`), displayed, never stored — same rule as procedure duration.

### 2.11 `in_hospital_outcomes`
At most one row per procedure; created on discharge or on first edit.
| column | type | notes |
|---|---|---|
**Every yes/no outcome uses `tri_state` = `yes, no, not_recorded` (default `not_recorded`). "Not recorded" is never the same as "No" — above all for MI, stroke, AKI and death.** The UI shows three buttons; the registry count treats `not_recorded` as missing.
| column | type | notes |
|---|---|---|
| mi | tri_state | periprocedural MI |
| stroke | tri_state | |
| death | tri_state | |
| death_cause | text, nullable | present only when `death = yes` |
| bleeding | tri_state | |
| bleeding_barc | integer 0–5, nullable | present only when `bleeding = yes`; 3a/3b/3c stored as 3 with `bleeding_barc_sub text null` |
| transfusion | tri_state | |
| vascular_complications | vascular_complication[] | enum array: haematoma, pseudoaneurysm, av_fistula, retroperitoneal_bleed, limb_ischaemia, radial_occlusion, dissection_access_vessel, other — **multi-select**; empty array + `vascular_status tri_state` distinguishes "none" from "not recorded" |
| aki | tri_state | creatinine rise per KDIGO; `creatinine_post_umol_l numeric null` |
| new_dialysis | tri_state | |
| emergency_cabg | tri_state | |
| cardiac_tamponade | tri_state | |
| unplanned_repeat_pci | tri_state | |
| disposition | enum: home, ward, ccu, icu, transferred, deceased, left_against_advice, nullable | supersedes `post_procedure_destination` for the discharge moment; both kept |
| event_links | uuid[] | ids of `complications` rows that explain these outcomes (e.g. tamponade ← perforation event). The UI offers "Record as outcome" on an event, which creates/updates the matching outcome and the link — no double entry |
Rules (SQL): `death = yes` ⇒ `disposition = deceased` **and** `procedures.post_procedure_condition = deceased` (that enum exists since 0006); a `discharges` row is **not** created for a death — `discharges` has no status column, only free-text `clinical_status`, so the rule is: `death = yes` ⇒ no `discharges` row for that procedure (refuse insert; the summary says "died in hospital" from the outcome row). Conversely `discharges` row exists ⇒ `death` ≠ `yes`. A `complications` row of type `death`/`stroke`/`cardiac_tamponade` ⇒ the matching outcome cannot be `no` (it may be `not_recorded` until confirmed).

### 2.12 Registry completeness view
`registry_completeness(procedure_id)` SQL function returning `(filled integer, total integer, missing text[])` over the NIC element list in `lib/registry/nic-elements.ts` (Week 7 ships the list and the function; Week 8 ships the export). Shown on the report header as "NIC registry · 36 of 42".

## 3. UI

Design rule for all of it: **a sheet, not a step**. The report page (`/procedures/[id]`) stays the cath-report layout; each section gets an "Edit" affordance that slides a 420 px sheet from the right. The 6-step capture form gains the same fields in the same groups so a case can still be entered from scratch. Both write the same tables. Phone layout: sheets become full-screen pages.

Every picker is big-button (44 px min). Every typed number has its unit beside it. Every optional block has a visible "Not performed" option, which is a *recorded fact* (three-state rule), not an empty field. *registry* items show a small "R" tag and count in the header.

### 3.1 Lesion sheet (from a vessel-finding row; the Week 8 tree opens the same sheet)
Order: vessel · segment · stenosis % (0–100 slider + 30/50/70/90/100 buttons; shows `measured_viewer` tag when that source exists) · *R* TIMI pre · culprit · length mm · class A/B1/B2/C · calcification · thrombus · ostial · bifurcation → Medina picker (three toggles rendered as a Y) · tortuosity · CTO → months · ISR → pattern · collaterals Rentrop · TIMI frame count · notes. Footer buttons: "Physiology" and "Imaging" open 3.2 pre-filled for this lesion.

### 3.2 Physiology & imaging sheet (per lesion)
Two tabs. **Physiology**: list of rows; "Add": phase, index, value (numeric pad 0.00–1.00), agent + dose, decision defer/treat. A value < 0.80 (FFR) or < 0.89 (iFR/RFR) is shown in amber with the usual cut-off noted — information, not a verdict. **Imaging**: list of rows; "Add": modality, phase, then the fields of 2.4 relevant to that modality (NIRS shows LCBI only with IVUS fields; OCT shows calcium/lipid arcs). Post rows show expansion % computed from MSA / reference if both present.

### 3.3 Haemodynamics & LV sheet (from the "From the machines" / pressures area)
One block this week — Left heart — with its status pill (Not recorded / Not performed / Recorded); tapping "Recorded" reveals the fields. A greyed "Right heart · valves — coming later" row keeps the layout honest. LV: EF % + source + date (existing), MR grade 0–4, LV-gram performed, wall motion bullseye (17 segments; tap cycles normal → hypo → akinetic → dyskinetic → aneurysmal; legend).

### 3.4 Grafts sheet (from "+ Graft" in Findings; only shown when `prior_cabg = true` or a graft exists)
List + "Add graft": type, target vessel, sequential, patency, stenosis %, lesion location, CABG year. Saving a stenosed graft offers "Add as lesion" which creates the `vessel_findings` row with `vessel = graft, graft_id`.

### 3.5 Intervention & devices sheet (from an intervention row)
Techniques as multi-select chips in three rows — *Balloon*: POBA, predilation, post-dilation, POT, re-POT, kissing balloon · *Stent*: direct stent, bail-out stent, stent overlap · *Advanced* (collapsed by default): thrombectomy, rotational, orbital, IVL, laser, cutting, scoring, DCB, CTO antegrade/retrograde, Other + description. When the lesion is a bifurcation, a **Bifurcation strategy** picker appears (provisional / T-TAP / culotte / DK-crush / mini-crush / SKS / other). Then guide catheter · wires (multi) · *R* residual % · *R* TIMI post · success → if no, failure reason · dissection → grade A–F · perforation → Ellis class · no-reflow · total stent length (derived, editable).

**Events** (same sheet, lower half, replaces the old complications picker): list of procedural events; "Add event": type (grouped: vessel · rhythm/haemodynamic · systemic · access), time, grade where applicable, treatments (multi-select chips incl. defibrillation, temporary pacing, covered stent, pericardiocentesis, IABP/Impella), resolution. Each event has "Record as outcome" which fills the matching 3.6 outcome and links it. Devices list below with phase grouping (existing), each row expandable to the inflation log ("Add inflation": atm, seconds). Lot/UDI fields unchanged (scanner arrives Week 10).

### 3.6 Indication & outcome sheet (from the patient strip and from Discharge)
**Indication tab**: CCS, NYHA, stress test type/result, cardiogenic shock, cardiac arrest, prior PCI/CABG, thrombolysis; STEMI block appears when indication = stemi: symptom onset, FMC, door, device time, with derived door-to-device shown large and coloured by ≤90 min (green) / ≤120 (amber) / >120 (red) — the only red on the page. **Outcome tab**: every outcome as three buttons **Yes / No / Not recorded** (default Not recorded, shown in grey, counted as missing by the registry); vascular complications as multi-select chips plus the same tri-state; linked events shown under each outcome ("from event: perforation 11:21 → pericardiocentesis"); disposition; creatinine post with AKI *suggested* (never auto-set) when rise ≥ 26.5 µmol/L or ≥ 1.5×.

### 3.7 Report header
Adds "NIC registry · n of 42" with a tooltip listing missing elements; clicking an item opens the sheet that holds it. Sign-off (Week 5) does **not** block on registry completeness — it warns.

### 3.8 Capture form
Step 3 (Angiography) rows gain a "Details" button → 3.1. Step 4 gains technique chips and inflation log. Step 2 gains the indication block. Step 5 gains haemodynamics blocks. Step 6 gains the outcome tab. Mobile-first still.

## 4. FHIR

- Every numeric measurement in 2.3–2.5 and 2.11 → `Observation` with `bodySite` (lesion vessel/segment, existing coding) and `code` from `lib/fhir/codes.ts`. Add and **verify** (same `fhir:verify-codes` process): LOINC for FFR, iFR, LVEF (exists), cardiac output/index, PA/PCWP/RA pressures, aortic/mitral gradients and areas, BARC bleeding (SNOMED), Rentrop (SNOMED finding), lesion class (SNOMED), Medina (text in `Observation.component` if no code is verifiable — document that choice). Anything that cannot be verified ships as `Observation.code.text` only, listed in `docs/fhir-mapping.md` §"unverified".
- Techniques → `Procedure.usedCode` (SNOMED procedure codes where verifiable, else text).
- Grafts → `BodyStructure`? No — keep the Week 2 shape: graft findings are Observations with `bodySite.text = "SVG to OM1"`.
- Outcomes → `Observation` per true flag + `Encounter.hospitalization.dischargeDisposition`.
- Haemodynamics "not performed" → `Observation` with `dataAbsentReason = not-performed` (same as LVEDP today).
- Validator target stays **0 errors**; new warnings are listed in the Week 2 table with a Week 7 row.

## 5. AI summary (prompt v7)

May mention: FFR/iFR result and the defer/treat decision, IVUS-guided stenting and final result in plain words, LVEF and what it means in one sentence, any in-hospital outcome that the patient should know (bleeding, kidney check needed), STEMI timing *not* mentioned (clinical metric, not patient-facing). The deterministic audit extends to the new tables: any number in the summary must exist in the record; `defer`/`treat` wording must match `lesion_physiology.decision`. Six languages, same as v6. Version bump recorded as in Week 4.

## 6. Definition of done

- Migration 0011 applies cleanly on a fresh database and on production; nothing existing renamed or dropped; `procedure_snapshot` parity holds for all 21 cases (SQL vs TypeScript) with the new tables included.
- Amending a reviewed case can change any Week 7 field and the diff lists it with before/after.
- All six sheets work on desktop and phone; every enum has a picker; every optional block offers "Not performed"; every outcome is tri-state and nothing defaults to "no"; no field is required to save except those required before Week 7.
- Registry definitions are mapped **separately** in `lib/registry/nic-elements.ts` and a `docs/registry-mapping.md` that cites the NCDR CathPCI v5 coder's data dictionary element names where NIC borrows them; Hrudaya's event list is a reporting list, not the registry's — the mapping says which Hrudaya value feeds which element.
- Report header shows the registry count; each missing element deep-links to its sheet.
- Seed: 21 cases updated — includes one post-CABG with two grafts (one stenosed and treated), two STEMI with full timings (one ≤90 min, one >120), one FFR-deferred lesion (0.86, defer, not treated), one IVUS-guided PCI with pre and post rows, one bifurcation treated with provisional strategy + POT + kissing balloon, one POBA-only case, one perforation event treated with covered stent and pericardiocentesis **linked** to a tamponade outcome, one BARC 3a bleed with transfusion, one AKI; several cases leave outcomes as `not_recorded` on purpose so the registry count shows gaps.
- FHIR: all 21 Bundles validate with 0 errors; every new Observation code verified or documented as text-only; `fhir:hapi` round-trip still passes.
- AI summary v7 audit passes on all 21; the FFR-deferred case's summary says the lesion was *not* stented and why, in all six languages.
- `docs/structured-reporting.md` written: field list, source of each element (NIC / NCDR / vendor), what is `typed` today vs reserved for feeds.
- README: Week 7 section + one screenshot of the lesion sheet.

## 7. Claude Code prompt

> Read `docs/week7-structured-reporting-spec.md` in full, then `docs/week1-spec.md` §3, `supabase/migrations/0005_dapt_meds_signoff_times.sql`, `0007_safety_access_communication_measurements.sql`, `0009`/`0010`, `lib/amendments/`, `lib/fhir/mapper.ts`, `lib/fhir/codes.ts`, and `docs/fhir-mapping.md`. Then:
> 1. Write `supabase/migrations/0011_structured_reporting.sql` exactly as §2: the `value_source` enum, new columns on `vessel_findings`, `interventions`, `procedures`, and the new tables `lesion_physiology`, `intravascular_imaging`, `haemodynamics`, `lv_wall_motion`, `grafts`, `device_inflations`, `in_hospital_outcomes`. Copy existing aortic pressure, LVEDP and guidewire values into the new homes; leave the old columns. Attach `guard_reviewed_child` to every new table. Enforce the "present only when" rules with CHECK constraints. Use the `tri_state` enum for every in-hospital outcome and never a boolean default false. Make `vascular_complications` an enum array. Add `event_links` and the SQL rules in §2.11. Add the traceability columns (UIDs, frame, view, method) in §2.2–2.4 even though nothing writes them this week. Add `registry_completeness(procedure_id)` and `lib/registry/nic-elements.ts` with the NIC element list (cite the element names in a comment; synthetic project — no registry credentials). Extend `procedure_snapshot` (SQL and TypeScript) to include every new table and keep parity.
> 2. Regenerate `lib/database.types.ts`.
> 3. Build the six side sheets in §3 as one reusable `Sheet` component under `components/report/sheets/`, opened from the report page sections named in §3; mobile = full-screen page. Big-button pickers (44 px), units beside numbers, "Not performed" as a recorded state. Add the same fields to the capture form steps as §3.8. Add the registry count to the report header with deep links.
> 4. Extend the FHIR mapper per §4. Add every new code to `codes.ts` and run `npm run fhir:verify-codes`; anything unverifiable ships as text and is listed in `docs/fhir-mapping.md`. Run `npm run fhir:validate` — 0 errors on all cases.
> 5. Bump the summary prompt to v7 per §5 and extend the audit to the new tables.
> 6. Update the seed per §6 and re-seed locally; do not touch production data until I say so.
> 6a. Add "Week 7b — right heart, valves, shunts" to `docs/backlog.md` with the deferred columns from §2.5 so nothing is lost.
> 7. Write `docs/structured-reporting.md` and the README section.
> Work in this order, commit after each numbered step with a clear message, and stop to show me the lesion sheet on a phone-sized viewport before building the other five.

## 8. Pavan's week

- Day 1: read §2 once; you do not need to understand every column, but check the **clinical** choices: are the technique chips the ones your labs used? Is anything missing from the complications/outcomes list that you saw in two years in a cath lab? Tell me before Claude Code starts.
- Day 2: phone-test the lesion sheet when Claude Code pauses. Report in plain language ("the Medina picker is confusing", "I can't find thrombus").
- Day 3–4: test the other sheets as they land; enter a full post-CABG case and a STEMI case by hand to see the sheets in use.
- Day 5: review `docs/structured-reporting.md`; this is the document you will quote in interviews. Then the LinkedIn post ("Week 7: mapped Hrudaya to the NIC and NCDR CathPCI element sets…") — show me first.
- For Amar tonight: `stenosis_source`, `mld_mm`, `rvd_mm` and the `measured_viewer` / `pullback` sources are where his viewer and QCA will write. Agree the **traceability contract** in §2.2 with him: each measurement names the lesion, the image (DICOM study/series/instance UID), the frame, pre/post, and the method. If his software can't supply those, the number doesn't enter the record.
