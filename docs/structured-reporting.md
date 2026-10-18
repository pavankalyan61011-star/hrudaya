# Structured reporting fields (Week 7)

Spec: [week7-structured-reporting-spec.md](week7-structured-reporting-spec.md). Registry mapping:
[registry-mapping.md](registry-mapping.md). FHIR: [fhir-mapping.md §7](fhir-mapping.md).

Weeks 1–6 built a correct record: patient → findings → interventions → devices → complications →
discharge. Week 7 adds what a cath report and a PCI registry also expect:
- lesion morphology;
- pressure-wire physiology and intravascular imaging;
- left-heart haemodynamics and LV function detail;
- bypass grafts;
- technique and bifurcation strategy, and the inflation log;
- procedural events with their treatment;
- indication detail and STEMI times;
- in-hospital outcomes recorded yes / no / not recorded.

It does this **without turning the report into a 40-field form**: each group is a sheet opened from
the part of the report it describes.

> Every value has a source. This week every value is **typed** or **picked** by a person; the same
> columns are ready for a viewer, a QCA module or a haemodynamic system to write later, with a
> different `source` and the image it was measured on.

## Where things are entered

| Sheet | Opened from | Capture step |
|---|---|---|
| Lesion | "Edit lesion" on a finding; registry links | 3 — "Details" per saved row |
| Physiology & imaging (two tabs) | "Physiology & imaging" on a finding; the Lesion sheet | via the Lesion sheet |
| Haemodynamics & LV | Coronary anatomy, "Edit haemodynamics & LV" | 5 |
| Grafts | Coronary anatomy, "+ Graft" / "Edit grafts" (shown when previous CABG = yes, or a graft exists) | 3 |
| Intervention & devices (detail, events, inflation log) | each intervention, "Edit intervention & devices" | 4 — one link per intervention |
| Events | Complications, "Edit procedural events" (for a study with no intervention) | 5 |
| Indication & outcome (two tabs) | Presentation, "Edit indication detail"; In-hospital outcomes, "Edit outcomes" | 2 (Indication), 6 (Outcome) |

The sheets edit a draft, or a reviewed record with an open amendment (Week 6). That's the same rule
as the capture form, enforced again by the database. A reviewed record shows the values and no edit
links. Opening a sheet is part of the URL (`?sheet=…&row=…&tab=…`), so a link can open it and a phone's
Back button closes it.

**Patterns, the same in every sheet** (owner's review of the lesion sheet, 18 Oct 2026):
- every choice is a big button (44 px); every typed number has its unit beside it;
- an optional value has an explicit **Not recorded** choice;
- a three-state block (left heart, LVEF) has **Not recorded / Not performed / Recorded**;
- a yes/no stored as `boolean default false` shows **neither** button until tapped. An untouched "No"
  would look like a recorded finding. It still saves `false` (backlog: tri-state in Week 7b);
- TIMI is written 0 / 1 / 2 / 3, never in Roman numerals;
- red is kept for "needs attention" (the door-to-device > 120 min box, errors). Medina and the
  wall-motion bullseye use ink and grey;
- "R" marks a registry element, with a dismissible "R = needed for the registry" line;
- Close, Cancel and Escape ask "Discard changes?" only when something changed.

The report header shows **Registry · n of 42**. Opening it lists the missing elements, each a link to
the sheet or step that holds it, under the line "modelled on CathPCI v5; NIC mapping pending". The
list is never called "NIC fields". Sign-off warns about missing elements but is never blocked by them.

## Field list

**Source column.** **R**: one of the 42 registry elements (modelled on NCDR CathPCI v5 concepts; see
[registry-mapping.md](registry-mapping.md)). **V**: a field vendor cath-report systems commonly
capture (syngo Dynamics, Merge Cardio, Philips, Change/Optum, all CathPCI-mapped). This is the
spec's comparison; I haven't checked it against any one vendor's schema. **H**: Hrudaya's own, for
traceability.

**Today column.** **typed** or **picked**: entered by a person this week. **reserved**: no screen
writes it yet; it's waiting for a feed.

### Lesion (`vessel_findings`)

| Field | Source | Today |
|---|---|---|
| ACC/AHA lesion class A / B1 / B2 / C | R (treated lesions), V | picked |
| Lesion length (mm) | R (treated lesions), V | typed |
| Ostial, bifurcation + Medina (drawn as a Y), tortuosity, CTO + duration, in-stent restenosis + pattern | V | picked / typed |
| Collaterals (Rentrop 0–3), corrected TIMI frame count | V | picked / typed |
| Graft lesion → its graft (`graft_id`) | V | picked |
| Stenosis % source (`stenosis_source`) | H | typed / picked |
| MLD, RVD (mm); measurement method (visual / QCA manual / QCA automatic) | V | reserved (QCA, Week 12) |
| Image traceability: study / series / instance UID, frame, view | H | reserved (viewer, Weeks 11–12) |

**Traceability contract** (agreed with the viewer side): a measured value names
1. the lesion,
2. the image (its DICOM UIDs),
3. the frame,
4. pre or post,
5. the method,
6. its `source`.

A module that can't supply 1–5 writes nothing.

### Physiology (`lesion_physiology`) and imaging (`intravascular_imaging`)

| Field | Source | Today |
|---|---|---|
| FFR / iFR / RFR / dPR / resting Pd/Pa, pre or post, value 0.00–1.00 | R (intermediate lesions), V | typed |
| Hyperaemic agent + dose; decision defer / treat | V | picked / typed |
| Method pressure wire / angiography-derived (QFR-type) | H | pressure wire; angiography-derived reserved (licence) |
| IVUS / OCT / NIRS-IVUS, pre or post: MLA, EEM, plaque burden, calcium arc and thickness, lipid arc, maxLCBI, MSA, expansion, malapposition, edge dissection, pullback length | R (intermediate lesions), V | typed |
| Pullback UIDs, MLA frame, tracing method | H | reserved (pullback, Week 12) |

The sheet shows a value below the usual cut-off (FFR < 0.80, iFR/RFR < 0.89) in amber, as information
rather than a verdict. Post-stent expansion is suggested from the MSA and the lesion's reference
diameter, never set automatically.

### Haemodynamics and LV

| Field | Source | Today |
|---|---|---|
| Left heart (`haemodynamics`): status, aortic systolic / diastolic / mean, LV systolic, LVEDP | V | typed (three-state) |
| Heart rate and rhythm at measurement | V | typed / picked |
| LVEF + source + date (Week 1 columns) | R | typed (three-state) |
| Mitral regurgitation grade 0–4, LV-gram performed | V | picked |
| Wall motion, AHA 17 segments (`lv_wall_motion`, abnormal segments only) | V | picked (bullseye) |
| Right heart, valves, shunts | — | deferred to Week 7b ([backlog](backlog.md)) |

### Grafts, intervention, devices

| Field | Source | Today |
|---|---|---|
| Graft type, target, sequential, patency, stenosis %, lesion location, CABG year | V | picked / typed |
| Techniques (balloon / stent / advanced chips; "other" + text) | R, V | picked |
| Bifurcation strategy (EBC terms; only for a bifurcation lesion) | V | picked |
| Guide catheter, wires (several) | R (guide), V | typed |
| Failure reason, dissection grade (NHLBI A–F), perforation class (Ellis), no-reflow, stent overlap, total stent length | V | picked / typed |
| Inflation log per device (`device_inflations`: atm, seconds) | V | typed |

### Procedural events and in-hospital outcomes

| Field | Source | Today |
|---|---|---|
| Event type (extended list), time, grade per type, treatments, resolution | V | picked |
| Outcomes, each yes / no / not recorded: MI, stroke, death (+ cause), bleeding (+ BARC), transfusion, vascular (+ which), AKI (+ creatinine after), new dialysis, emergency CABG, tamponade, unplanned repeat PCI | R | picked |
| Disposition | R | picked |
| Outcome ← event links ("Record as outcome") | H | picked |

The outcome rules (spec §2.11) are enforced in the database:
- death = yes goes with disposition and post-procedure condition both "deceased", and with no discharge;
- an event of a type rules out "no" for the matching outcome.

AKI is suggested from the creatinine rise (≥ 26.5 µmol/L or ≥ 1.5×), never set.

### Indication

| Field | Source | Today |
|---|---|---|
| CCS (not for STEMI), NYHA, stress test + result, cardiogenic shock, cardiac arrest, previous PCI / CABG, thrombolysis | R | picked |
| STEMI: symptom onset, first medical contact, door, first device | R | typed |
| Door-to-device | R | **derived, never stored**. Green ≤ 90 min, amber ≤ 120, red > 120 |

## Database (migration 0011)

- **Value source:** `value_source` (typed, picked, scanned, measured_viewer, pullback, hemo_system,
  xray_dose, phone, generated); every new table has `source`, `recorded_by`, `recorded_at` and `notes`.
- **Yes / no / not recorded:** `tri_state` for every outcome; nothing defaults to "no".
- **Rules:** "present only when" rules are CHECK constraints. The §2.11 rules that span tables are
  deferred constraint triggers that re-check the procedure's current state at commit.
- **Reviewed records:** `guard_reviewed_child` covers all seven new tables. Deletes are allowed
  while a record is a draft or has an open amendment.
- **Amendment snapshot:** `procedure_snapshot` includes every new table. SQL and TypeScript match
  for 24 of 24 local and 21 of 21 production cases, so an amendment lists Week 7 changes with
  before/after.
- **Registry:** `registry_completeness(procedure_id)` → filled, total (42), missing keys, over the
  same list as `lib/registry/nic-elements.ts`.
- **Kept in step:** the old columns (aortic pressure, LVEDP, guidewire) stay. The Haemodynamics
  sheet writes them too, and `wires[1]` writes `guidewire`.
- **Undo:** `supabase/undo/0011_undo.sql` returns the schema to 0010. It's safe only before Week 7
  data worth keeping exists. Rehearsed: the schema came back identical except the 11 event-type
  values Postgres can't drop.

## Tests and results (18 Oct 2026)

- **SQL behaviour:** 79 checks in `supabase/tests/0011_behaviour.sql`, all pass, also on the new
  seed. The earlier probes pass too: 0001 17 (fixed for the current schema), 0008 20, 0009 55.
- **Snapshot parity:** TypeScript = SQL for 24/24 local cases with Week 7 data, and 21/21 on
  production. Two deliberate breaks to the TypeScript snapshot, one to the sort key and one to the
  graft key, were each caught.
- **Unit tests:** 161 pass. They include 5 Week 7 diff tests, 3 registry-list tests (TypeScript =
  SQL, same keys and order) and 7 Week 7 FHIR mapper tests.
- **FHIR:** HL7 validator 7.0.1, 0 errors on 24 local cases with Week 7 data and on 21 production
  cases. 41 of 41 coded concepts verify on tx.fhir.org.
- **Seed:** 24 cases, with every §6 scenario checked in the database.
- **Browser, local, 390 px emulated and 1280 px:** every sheet used with real taps and typing, and
  every save confirmed in the database. Reviewed records show no edit links. Re-saving capture steps
  4 and 5 kept all Week 7 rows. Not yet tried on a real phone.

## Corrections after build

The spec's sections are unchanged; what was built differs here. Owner decisions are dated.

- **Event time is the existing `onset_at`**: no separate `occurred_at` (owner, 18 Oct). **Arrhythmia
  is one value**, with its type (VF / VT / complete heart block / AF with compromise) in `grade`;
  `significant_arrhythmia` was dropped (owner).
- **Registry wording:** the header reads "Registry · n of 42" with "modelled on CathPCI v5; NIC
  mapping pending". The 42 names aren't verified against an official NIC dictionary, and the owner
  reviews them before anything is posted (owner).
- **Right heart, valves and shunts** are deferred to Week 7b; §1's mention of a right-heart seed case
  was corrected (owner).
- **An Events sheet** for a study with no intervention. The spec puts events in the Intervention &
  devices sheet, but events belong to the procedure, so a diagnostic-only case needs its own way in.
  The sheet reuses the same section.
- **Capture steps open the same sheets** (§3.8) rather than repeating their fields inline. Both write
  the same tables. A step remounts after a sheet saves, so a stale form can't overwrite the sheet.
- **Aortic pressure and LVEDP moved** from capture step 3 to the Haemodynamics & LV sheet (step 5),
  which keeps the old columns in step.
- **Linked events in the Outcome tab** appear under the outcome their type suggests. `event_links`
  is one list per outcomes row, with no per-outcome key.
- **Four fixes made while testing:**
  1. **Capture steps 4 and 5 replaced rows on every save.** That would have deleted Week 7 data:
     techniques, inflation logs, event treatments and outcome links. They now update saved rows in
     place and only insert or delete what changed. Verified by re-saving both steps: same ids, nothing
     lost.
  2. **LVEDP "not performed" survives the Haemodynamics sheet.** The left block has one status for
     all its values, so a save without LVEDP had turned the seeded "not performed" into "not
     recorded". The old column now changes only when the sheet says something about LVEDP.
  3. **A death is all-or-nothing.** When "death = yes" was refused because a discharge exists, the
     procedure had already been set to deceased. It's now refused before anything changes, and the
     condition is restored if the outcome save fails.
  4. **The wire placeholder isn't copied as a wire.** The seed stores "Not recorded" in the required
     Week 1 `guidewire`, and 0011 had copied it into `wires`. It now copies real wire names only:
     1 of 19 locally, 2 on production.
- **Graft-link check is `NOT VALID`**, found while rehearsing the undo. A graft finding recorded
  before 0011 would have made the migration fail. The check still applies to every row written from
  now on. Production had none.
- **The seed carries the §6 scenarios** that no existing story had in four new cases, PCI-2026-022
  to 025 (owner, 18 Oct). Cases 001–020 keep their reviewed stories; their Week 7 values are listed
  under "Week 7 additions" in the case files.
- **FHIR:**
  - FFR/iFR values, invasive pressures, BARC, Rentrop, lesion class and Medina have no verifiable
    code and ship as text.
  - Techniques go in `Procedure.usedCode` as text, because SNOMED's codes for them are procedures.
  - Indication detail and STEMI times aren't mapped yet (backlog).

## Not built (backlog)

- Week 7b: the right-heart, valve and shunt blocks; yes/no columns moved to tri-state.
- FHIR for indication detail and STEMI times; per-resource narrative (dom-6).
- The registry export (Week 8); the owner's review of the 42 names.
