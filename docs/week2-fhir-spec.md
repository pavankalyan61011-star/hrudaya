# Hrudaya — Week 2 Spec: FHIR R4 export

> Goal: every reviewed procedure can be exported as a valid FHIR R4 **document Bundle** that passes the official validator and loads into a public HAPI FHIR server.
> Schema is frozen (migrations 0001–0007). Week 2 adds **no columns**. It adds code tables, a mapper, an endpoint, a UI button, tests and docs.

Drop this at `docs/week2-fhir-spec.md`. Read `docs/week1-spec.md` §3 first for the data model.

---

## 0. Why this week matters (read this, Pavan)

Week 1 made the data structured. Week 2 makes it **portable**. A FHIR Bundle is a standard JSON document that any modern health system — a hospital EMR, an insurer, a national registry, ABDM — can read without knowing anything about Hrudaya. After this week, every PCI you record can leave the app in a form the rest of healthcare understands. ABDM (Week 3) requires exactly this: it only accepts health records as FHIR.

### The six resources, in plain words

Learn these. By Friday you should be able to say each of these out loud without the page.

| Resource | What it is | Which Hrudaya tables feed it |
|---|---|---|
| **Patient** | Who the patient is: identifiers, name, sex, date of birth. The ABHA number goes in `identifier` in Week 3. | `patients` |
| **Encounter** | The hospital visit: admitted when, discharged when, which facility. Everything else hangs off it. | `procedures.admitted_at`, `discharges.discharged_at`, `facilities` |
| **Procedure** | What was done: the angiography/PCI itself. Has a code (SNOMED), who performed it, when, on which body site, and `focalDevice` pointing at each stent. Complications link here. | `procedures`, `interventions`, `complications`, `operators` |
| **Device** | One physical thing that went in or was used: the stent, with lot number, expiry, UDI, manufacturer. One Device resource per `devices_used` row. This is the traceability story. | `devices_used` |
| **Observation** | One measurement: stenosis % of a vessel, TIMI flow, LVEF, LVEDP, ACT, BP, creatinine, radiation dose. Has a code (LOINC or SNOMED), a value with units, a status, and a time. The three-state rule maps here: `not_performed` → Observation with `dataAbsentReason`; `not_recorded` → no Observation at all. | `vessel_findings`, `procedures` (haemodynamics, labs, radiation, LVEF/LVEDP), `procedure_medications.act_seconds` |
| **MedicationRequest** | A prescription: what the patient goes home on. Drug, dose, frequency, route, intended duration. DAPT plan maps here. | `discharge_medications`, `discharges.dapt_*` |
| **MedicationAdministration** | A drug actually given during the visit: heparin, loading doses, sedation, adenosine. Has the time it was given. | `procedure_medications` |
| **Condition** | The diagnosis: NSTEMI, STEMI, stable angina. And each risk factor (hypertension, diabetes) as its own Condition. | `procedures.indication`, `patient_risk_factors` |
| **Practitioner** | A clinician: operator, reviewing clinician. HPR id goes in `identifier` later. | `operators` |
| **Organization / Location** | The hospital and the cath lab. HFR id goes in `identifier` in Week 3. | `facilities` |
| **Composition** | The cover page of a document bundle: title, author, date, status, and a section list pointing at everything above. This is what makes the Bundle a *document* and not a loose bag of resources. | `procedures` (status, reviewed_at, reviewing clinician) |
| **Bundle** (type = `document`) | The envelope. First entry is the Composition; every other resource referenced from it is included. One Bundle per procedure. | everything |

Nine extra resources beyond the five I named earlier — that is normal; a real clinical document needs them. Don't memorise the list; memorise the shape: *Composition points at Patient, Encounter, Procedure, Devices, Observations, Medications, Conditions, Practitioners, Organization.*

---

## 1. What Week 2 delivers

1. **Code tables** (`lib/fhir/codes.ts`): SNOMED CT, LOINC and UCUM codes for every enum and measurement we export. Human-readable display text beside each code.
2. **Mapper** (`lib/fhir/mapper.ts`): pure functions. `procedureToBundle(procedureId) → Bundle`. No I/O inside the mapping functions; a loader fetches rows, the mapper transforms them.
3. **Validation in CI**: every seeded case exports and passes the HL7 FHIR validator with zero errors (warnings allowed, listed in a report).
4. **API route** `GET /api/fhir/procedures/[id]` → `application/fhir+json`, auth required, only for `status = reviewed`.
5. **UI**: "Export FHIR" button on the report page (reviewed procedures only): downloads the JSON, and a side panel shows it pretty-printed with the resource list collapsed/expanded.
6. **HAPI test**: one script that POSTs a Bundle to the public HAPI R4 server and reads it back by id. Screenshot in README.
7. **Docs**: `docs/fhir-mapping.md` — the table in §0 expanded field by field, with the codes used. This is a CV artefact.

Not in Week 2: ABDM (Week 3), inbound FHIR (never, for now), FHIR server hosting (no — we export documents, we don't run a server), FHIR search.

---

## 2. Stack additions

Allowed new dependencies (ask before adding any other):
- `@types/fhir` — TypeScript types for R4 resources. Types only, no runtime.
- `fhir-validator` is **not** an npm package we use; validation runs via the official **HL7 FHIR Validator JAR** (`validator_cli.jar`, needs Java 17+) in a script. If Java is not on the Mac, install via Homebrew (`openjdk@17`) — ask first.
- Optional: `uuid` if not already available via Node's `crypto.randomUUID()` (prefer the built-in).

---

## 3. Bundle shape

```
Bundle (type: document, timestamp, identifier = procedure case_code)
 └─ entry[0]  Composition (status: final if reviewed; title "Cardiac catheterisation report — <case_code>")
 ├─ Patient
 ├─ Encounter
 ├─ Organization (facility)        ├─ Location (cath lab)
 ├─ Practitioner (operator)        ├─ Practitioner (reviewer, if different)
 ├─ Condition (indication)         ├─ Condition × n (risk factors)
 ├─ Procedure (the cath/PCI)
 ├─ Device × n (every devices_used row)
 ├─ Observation × n (vessel findings, haemodynamics, labs, radiation, LVEF, LVEDP, ACT)
 ├─ MedicationAdministration × n (procedure_medications)
 ├─ MedicationRequest × n (discharge_medications)
 └─ (no entry for discharge if not yet discharged — Encounter.status = in-progress)
```

Rules:
- Every resource gets a stable `id` derived from the database row id (UUID), so re-exporting gives the same ids. `fullUrl` = `urn:uuid:<id>`.
- All references are `urn:uuid:` internal to the bundle.
- `Composition.section` has one section per report block, in the same order as the report page: Patient & baseline, Access, Angiography, Intervention & devices, Procedure medications, Procedure details, Complications, Immediate outcome, Discharge.
- Synthetic marker: `Bundle.meta.tag` = `{system: "https://hrudaya.dev/tags", code: "synthetic", display: "Synthetic data — not a real patient"}`. Every Bundle carries it while `patients.is_synthetic` is true.

---

## 4. Mapping detail

### 4.1 Patient
- `identifier`: `{system: "https://hrudaya.dev/mrn", value: mrn}`. (Week 3 adds `{system: "https://healthid.ndhm.gov.in", value: abha_number}`.)
- `name.text` = full_name. `gender` = male/female/other. `birthDate`.
- `meta.tag` synthetic if is_synthetic.

### 4.2 Encounter
- `status`: `finished` if discharged, else `in-progress`.
- `class`: `IMP` (inpatient) for urgent/emergency; `AMB` for elective day cases that discharged the same day; else `IMP`.
- `period.start` = admitted_at, `period.end` = discharged_at.
- `serviceProvider` → Organization. `location` → Location.
- `reasonReference` → Condition (indication).

### 4.3 Condition
- Indication codes (SNOMED): STEMI `401314000`, NSTEMI `401303003`, unstable angina `4557003`, stable angina `233819005`, positive stress test — use `429559004` (abnormal exercise stress test), pre-op assessment / cardiomyopathy workup / other → `text` only, no code.
- Risk factors (SNOMED): hypertension `38341003`, type 2 diabetes `44054006`, type 1 `46635009`, dyslipidaemia `370992007`, current smoker `77176002`, ex-smoker `8517006`, family history of CHD `266894000`, CKD `709044004`, obesity `414916001`, prior PCI `415070008`, prior CABG `399261000`, prior MI `399211009`.
- `clinicalStatus` active; `subject` → Patient.

### 4.4 Procedure
- One Procedure for the whole case. `code`: diagnostic-only → SNOMED `33367005` (coronary angiography); PCI → `415070008` (PCI) with `33367005` as an additional coding. Note: `415070008` is "percutaneous coronary intervention" — use it; do not invent codes.
- `status`: completed. `performedPeriod` = started_at / ended_at.
- `performer[].actor` → Practitioner (primary operator). `location` → Location. `encounter` → Encounter.
- `bodySite`: one per treated vessel. SNOMED: LMCA `73208009` (left coronary artery main stem — verify), LAD `59438005`, LCX `57396005`, RCA `13647002`, D1/D2/OM/ramus/PDA/PLV → use parent vessel code + `text`. **Rule: if unsure of a SNOMED code, put the term in `text` and leave `coding` empty; never guess a number.**
- `focalDevice[]`: one per stent/DCB: `{action: {text: "implanted"} for stents, "applied" for DCB}, manipulated: → Device}`.
- `complication[]`: for each complications row, a CodeableConcept — dissection `234020005` (coronary artery dissection — verify), perforation, no-reflow, haematoma `385494008`, etc. Same rule: verify or use text.
- `note`: outcome_summary.
- `extension`: urgency (`https://hrudaya.dev/fhir/StructureDefinition/urgency`, valueCode elective/urgent/emergency); access site (`.../access-site`, valueCodeableConcept with text); dominance (`.../coronary-dominance`).

### 4.5 Device
- One per devices_used row. `type.text` = product_name + category display. `manufacturer`. `lotNumber`. `expirationDate`. `udiCarrier.carrierHRF` = udi when present.
- `deviceName[] = {name: product_name, type: "user-friendly-name"}`.
- `property[]`: diameter_mm (UCUM `mm`), length_mm, inflation_atm (UCUM `atm`).
- `patient` → Patient.
- Phase and balloon-vs-stent distinction go in `type.text` (e.g. "Pre-dilation semi-compliant balloon").

### 4.6 Observation
Every Observation: `status` final, `subject` → Patient, `encounter` → Encounter, `effectiveDateTime` = started_at (or measured time where we have one), `performer` → Practitioner.

| Source | code | value |
|---|---|---|
| vessel_findings.stenosis_pct | LOINC `33111-5`? — **no**: there is no clean LOINC for per-vessel stenosis; use SNOMED `397452009`? Also uncertain. **Decision:** code = `{text: "Coronary artery stenosis — <vessel> <segment>"}` with `bodySite` set to the vessel SNOMED, `valueQuantity` %, UCUM `%`. | % |
| vessel_findings.timi_flow | text "TIMI flow grade — <vessel>", `valueInteger` 0–3 | integer |
| lesion flags (calcification, thrombus, bifurcation) | `component[]` on the stenosis Observation, text-coded, `valueBoolean`/`valueString` | — |
| interventions.residual_stenosis_pct, timi_flow_post | same pattern, text "Residual stenosis post-intervention" | % / integer |
| baseline BP | LOINC `85354-9` (BP panel) with components `8480-6` systolic, `8462-4` diastolic, UCUM `mm[Hg]` | panel |
| heart rate | LOINC `8867-4`, UCUM `/min` | |
| aortic pressure | text "Aortic pressure (invasive)" with systolic/diastolic components, `mm[Hg]` | |
| LVEDP | text "Left ventricular end-diastolic pressure", `mm[Hg]`; `not_performed` → `dataAbsentReason = not-performed`; `not_recorded` → omit | |
| LVEF | LOINC `10230-1` (LV ejection fraction), UCUM `%`; `method.text` = lvef_source; `effectiveDateTime` = lvef_measured_on; same three-state handling | % |
| creatinine | LOINC `2160-0`, UCUM `umol/L` | |
| eGFR | LOINC `62238-1`, `mL/min/{1.73_m2}` | |
| haemoglobin | LOINC `718-7`, `g/dL` | |
| platelets | LOINC `777-3`, `10*9/L` | |
| contrast volume | text "Contrast volume administered", `mL`; `note` = contrast_agent | |
| fluoroscopy time | text, UCUM `min` | |
| air kerma | text "Cumulative air kerma", `mGy` | |
| DAP | text "Dose-area product", `Gy.cm2` | |
| ACT | LOINC `3184-5` (activated clotting time), UCUM `s`, `effectiveDateTime` = act_measured_at; `derivedFrom` → the MedicationAdministration | s |

Use `text`-only codes wherever the table says text. Do not invent LOINC/SNOMED numbers. Every LOINC above must be checked against loinc.org before use; if a check fails, fall back to text and note it in `docs/fhir-mapping.md`.

### 4.7 MedicationAdministration
- One per procedure_medications row. `status` completed. `medicationCodeableConcept.text` = drug_name (add SNOMED/RxNorm later; backlog).
- `effectiveDateTime` = administered_at. `dosage.dose` = dose + unit (UCUM; `units/kg` → `[iU]/kg`), `dosage.route.text`.
- `reasonCode.text` from notes where present (e.g. "for no-reflow").
- `context` → Encounter.

### 4.8 MedicationRequest
- One per discharge_medications row. `status` active, `intent` order. `medicationCodeableConcept.text` = drug_name.
- `dosageInstruction[0]`: `doseAndRate[0].doseQuantity` (dose + UCUM), `timing.code.text` from frequency display ("once daily"), `route.text`, `asNeededBoolean` for PRN.
- `dispenseRequest.expectedSupplyDuration` from `duration` text when parseable (e.g. "12 months"); otherwise omit.
- DAPT rows: add `category = {text: "DAPT"}` and, on both DAPT rows, `extension` `https://hrudaya.dev/fhir/StructureDefinition/dapt-plan` with `plannedMonths` and `reviewDate` from the discharges row.
- `authoredOn` = discharged_at. `requester` → Practitioner (operator).

### 4.9 Practitioner / Organization / Location
- Practitioner: `name.text`, `qualification[].code.text` = role display. `identifier` HPR placeholder: omit until a value exists.
- Organization: `name` = facilities.name, `address.city`. `identifier` HFR: omit until a value exists.
- Location: `name` = cath_lab_name, `managingOrganization` → Organization.

### 4.10 Composition
- `status`: `final` if procedures.status = reviewed; `preliminary` if completed; export is refused for draft.
- `type`: LOINC `34896-3` (Interventional cardiology note — verify; else text "Cardiac catheterisation report").
- `date` = reviewed_at ?? ended_at. `author` → reviewing Practitioner (or operator). `attester` with `mode = professional`, `time` = reviewed_at, `party` → reviewer, when reviewed.
- `title` = "Cardiac catheterisation report — <case_code>".
- `section[]` as in §3, each with `title`, `text.div` (a short XHTML summary — a few lines, no PHI beyond what's in the resources), and `entry[]` references.

---

## 5. Validation

- Script `scripts/fhir-validate.ts`: exports every reviewed procedure to `tmp/fhir/<case_code>.json`, runs `java -jar validator_cli.jar <file> -version 4.0.1`, collects errors/warnings into `tmp/fhir/report.md`.
- Definition of pass: **0 errors** for all 20 seeded cases. Warnings allowed; list them in `docs/fhir-mapping.md` under "Known warnings" with a one-line reason each.
- Add `npm run fhir:validate`. Add it to CI if Java is available in the runner; otherwise document the manual step.

## 6. HAPI round-trip

- Script `scripts/fhir-hapi.ts`: POST one Bundle (PCI-2026-001) to `https://hapi.fhir.org/baseR4` as a transaction? **No** — a document Bundle is POSTed to `/Bundle` as-is. Read it back `GET /Bundle/<id>`. Print the server-assigned id and the resource count. Screenshot the HAPI response in README.
- Note in README: public HAPI is a shared test server; synthetic data only; the tag makes that explicit.

## 7. UI

- Report page, reviewed procedures only: **Export FHIR** button → downloads `<case_code>.fhir.json`.
- Below it, a collapsible **FHIR preview**: resource type list with counts (Patient 1, Observation 23, …), click a type to expand its JSON. Read-only. Mobile-safe.
- Draft/completed procedures: button disabled with tooltip "Available after clinical review".

## 8. Definition of done

- [ ] `docs/fhir-mapping.md` complete, every code either verified (with a link) or marked text-only
- [ ] All 20 seeded cases export; validator reports 0 errors
- [ ] One Bundle round-trips through public HAPI; screenshot in README
- [ ] Export button works on phone; preview readable
- [ ] API route refuses unauthenticated and draft requests (tests)
- [ ] Unit tests on the mapper: three-state Observations, DAPT extension, not-yet-discharged Encounter, device focalDevice links, stable ids on re-export
- [ ] Pavan can explain Patient, Encounter, Procedure, Device, Observation, MedicationRequest, Composition and Bundle in two sentences each, and point at the table each comes from

## 9. Claude Code prompt

```
Read docs/week2-fhir-spec.md and docs/week1-spec.md §3. Schema is frozen — add no columns or migrations. Build Week 2 in this order, committing after each step, pushing at the end:

1. Add @types/fhir (types only). Create lib/fhir/codes.ts with every code in spec §4, each with system, code, display and a `verified: true|false` flag plus a source URL where verified. For any code you cannot verify against loinc.org or browser.ihtsdotools.org, set verified:false and the mapper must emit text-only for it. Never invent a code.
2. Create lib/fhir/load.ts (fetch all rows for one procedure, server-side, RLS-respecting) and lib/fhir/mapper.ts (pure functions, one per resource type, plus procedureToBundle). Stable urn:uuid ids from row ids. Synthetic meta.tag on Bundle and Patient. Three-state rule for LVEF/LVEDP exactly as §4.6.
3. Unit tests for the mapper covering the cases in spec §8.
4. API route GET /api/fhir/procedures/[id]: auth required, 404 for not found, 409 for draft, 200 application/fhir+json. Tests.
5. scripts/fhir-validate.ts + npm run fhir:validate using the HL7 validator JAR (check for Java 17; if missing, stop and ask before installing). Run it across all reviewed cases; fix mapper issues until 0 errors. Write tmp/fhir/report.md.
6. scripts/fhir-hapi.ts: POST PCI-2026-001's Bundle to https://hapi.fhir.org/baseR4/Bundle, GET it back, print id and entry count.
7. Report page: Export FHIR button (reviewed only, disabled otherwise with tooltip) and the collapsible FHIR preview per §7. Mobile-safe.
8. docs/fhir-mapping.md: the full field-by-field mapping with codes, verification status, and Known warnings. Update README (Week 2 done, HAPI screenshot, how to run validation).

Ask before adding any dependency beyond @types/fhir. Never log patient data. When done, give me: validator summary (errors/warnings per case), the HAPI id, and a phone test list.
```

## 10. Pavan's week

- Day 1: paste the prompt; while it builds steps 1–2, read Patient, Encounter, Procedure on hl7.org/fhir/R4 (one page each, 20 min each).
- Day 2: read Device, Observation, MedicationRequest, Composition, Bundle. Open PCI-2026-001's exported JSON and find each resource in it.
- Day 3: validator passes; read tmp/fhir/report.md and ask me about any warning you don't understand.
- Day 4: phone test; explain the eight resources back to me in your own words (that's the interview rehearsal).
- Day 5: 60-second video #2 — "Hrudaya now exports FHIR" showing the preview panel and the HAPI round-trip; post it.
