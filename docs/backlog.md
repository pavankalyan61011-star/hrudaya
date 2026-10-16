# Hrudaya — backlog

The Week 1 schema is **frozen** after migration 0007 (2026-10-15). Anything below needs an owner
decision and a new migration; none of it is started.

Rule for every conditional measurement (spec §3): a `*_status` enum — `not_recorded`,
`not_performed`, `recorded` — beside the value. Conditional items are **never required**.

## Requested by the owner

- **Amend a reviewed procedure. Built in Week 6** ([amendments.md](amendments.md)): reason,
  snapshot, edit, signed diff, re-review, superseded summaries, FHIR `amended` + Provenance.
  Follow-ups are under "Found while building Week 6".
- **Linked consent checklist** — a checklist table (risks discussed, alternatives, interpreter,
  witness) linked to the consent time and clinician recorded today. 0007 stores only who and when.
- **"Not assessed" vs "not recorded"** — a further state for findings that were deliberately not
  assessed, beyond today's three-state rule. Not added yet.
- **Ward medication chart** — inpatient medicines; today only procedure and discharge medicines are
  stored (CAG-2026-020's ward medicines are therefore not in the database).
- **STEMI network timestamps** — first medical contact, door, wire/balloon; door-to-balloon derived.
- **Multi-facility support** — more than one facility and cath lab, with scoping by facility.
- **IVUS / OCT** — conditional intravascular imaging (PCI-2026-015's IVUS is in intervention notes today).
- **Calcium modification / lesion preparation** — a conditional per-intervention field for calcium
  treatment: rotational atherectomy (Rotablator), orbital atherectomy, intravascular lithotripsy
  (Shockwave IVL), cutting balloon, scoring balloon, high-pressure NC balloon; with a calcium
  severity grade; three-state rule applies. Today a Shockwave balloon can only be recorded as a
  device row. Pairs with the IVUS/OCT item above — same future migration.
- **Red flags should be required on every discharge — 11 of 19 seeded cases had none.** Found by
  the Week 4 eval: those leaflets had no "When to come back urgently" section, because prompt v2
  leaves out what the record does not hold. The seeded records are now corrected (see "Data
  corrections" below). Still open: a validation rule, so that a new discharge cannot be saved
  without red flags.
- **Urgency category on red flags (emergency vs prompt contact) instead of heading items.** Today
  the two urgency groups are stored as heading items ending in ":" inside `discharges.red_flags`
  (owner, 2026-10-15). The report page and the summary prompt both read them by convention. A
  category per item would need a migration, so the capture form could offer the standard set.
- **Form navigation for the capture steps** — moving between the six capture steps of the
  procedure form. Kept out of Week 5 by the spec ("stays on the backlog"); it was not yet written
  down here, so it is added now.
- **FFR / iFR** — conditional physiology per lesion.
- **Left ventriculography** — conditional; would become an `lvef_source` that can carry a value.
- **Mechanical circulatory support** — IABP, Impella, ECMO; conditional.

## Found while building Week 1

- **Patient weight** — weight-based doses (heparin 70 units/kg) are stored per kg; no total dose
  can be derived until weight is recorded.
- **Reviewer role** — any signed-in user can mark a procedure reviewed today (single role,
  spec §3.12); the reviewing clinician is chosen from operators, not tied to the login.
- **Case-file gaps** — guidewire and discharge clinical status are "Not recorded" for 002–020, and
  PCI-2026-001 has no stated DAPT duration; the seed does not invent them.

## Found while building Week 4 (AI discharge summary)

- **Structured complication outcome.** Complications store `severity` and `onset` as enums, but
  `management` and `outcome` are free text only, and there is no resolved field. Free text never
  reaches the model, so since prompt v3 the discharge summary mentions no complication at all
  (PCI-2026-005 haematoma, PCI-2026-010 no-reflow). A structured outcome (e.g. resolved /
  resolved with treatment / ongoing at discharge) would let the summary describe each complication
  together with its outcome. Meanwhile, the v3 eval shows the prompt rule is not enough: English
  complies, but at least 5 of 10 Indian-language drafts for 005/010 still mention the
  complication. The deterministic interim fix is to leave a complication out of the summary input
  until it has a structured outcome (`lib/summary/input.ts`). That needs owner approval and a
  re-run.
- **Structured medicine editor with preview instead of Markdown textarea.** Mostly done in Week 5:
  section editor, medicines table read-only from the record, View Markdown. Still open: the
  draft's "how often" / "for how long" cells can't be edited in place, because the table is never
  edited. A row editor for just those two cells would close it.
- **Native-reader check.** Telugu done (15 Oct 2026). Hindi, Tamil, Kannada and Malayalam are
  awaiting the five-question check in `docs/ai-summary.md`.
- **Approved summary on the FHIR Bundle.** An approved summary could be a `DocumentReference` (or
  a Composition section) in the export. Not mapped yet.
- **Summary reads at the clinician's own login.** `approving_clinician_id` is chosen from
  operators, as for review sign-off. It is not tied to the signed-in user (same as the Week 1
  reviewer-role note).
- **Print footer on iOS Safari.** The page number and synthetic-data footer use `@page` margin
  boxes, which Chrome prints and Safari ignores. Each page still says "Synthetic data" in its body.
- **Daily cap counts stored drafts only.** A call that is cut off or refused is billed but not
  stored, so it does not count toward the 20 a day. A counter table would fix that if abuse ever
  matters.
- **`drug_extra` aliases.** A model that writes "glyceryl trinitrate" for a record's "GTN" is
  flagged as an extra drug. Correct but noisy; an alias map would quieten it.

## Found while building Week 6 (amendments)

- **Roles.** Anyone signed in can open an amendment and close it, and the re-reviewing clinician
  is chosen from operators, not tied to the login. A clinician role (and perhaps "the opener can't
  be the only signer") needs the same roles work as the reviewer-role item above.
- **Amending identity fields.** Patient name, date of birth, MRN, sex, risk factors, case code and
  procedure date are locked while amending. Correcting them needs its own process: patient-level,
  because the patient row is shared by every procedure of that patient.
- **Patient details can change outside an amendment.** The lock holds only while an amendment is
  open. A new draft for the same patient can still edit the shared patient row, and that changes
  what that patient's *signed* records display. A guard or a versioned patient row would close
  this.
- **Cancel an amendment with rollback.** Today an amendment opened by mistake is closed with no
  changes (the button says so). A rollback would restore the snapshot. It needs care with child
  rows recreated while amending.
- **User display names.** "Opened by" shows "you (email)" or "another user", because logins have
  no names. A profile table (login → operator) would fix this and the roles item together.
- **Checklist heading items in the discharge step.** The red-flag checklist shows the two urgency
  headings ("…:") as checkboxes; unknown values are kept, so nothing is lost. This goes with the
  "urgency category on red flags" item.
- **Provenance detail.** Provenance carries who, when and why, but not *what*: the field-level
  changes stay in Hrudaya. An `entity` per changed resource, or a PurposeOfUse code agreed with
  ABDM, would clear the text-only warning.

## Data corrections (owner-approved, synthetic records)

- **2026-10-15: red flags and PCI-2026-005 timeline.** Data only, no schema change. Applied to
  `scripts/seed.ts`, `docs/cases/synthetic-cases-002-020.md` and the live database in one
  transaction (`supabase/data-corrections/2026-10-15-red-flags-and-005.sql`). The transaction
  switched the reviewed-record guards off for these statements only and back on before commit; a
  final check refused to commit unless every count matched. It was rehearsed first on a local
  copy loaded from the previous seed. There, an ordinary edit was refused again afterwards, and a
  second run was refused and rolled back.
  - **Standard red flags** were added to the 11 seeded discharges that had none: 002, 004, 006,
    007, 009, 011, 012, 014, 016, 018 and 019. That is two urgency headings plus 9 items, worded
    as in the case docs. 012 uses groin/foot and the rest wrist/hand. 019 says "aspirin" and the
    rest "blood-thinning tablets". 018 has no antiplatelet, so its bleeding item has no bracket
    (owner choice).
  - **PCI-2026-005:**
    - the access-site haematoma onset moved from 13:49 to 15:10 IST. It had been recorded before
      the sheath was removed at 14:49;
    - haemostasis changed from "other" (a seed assumption) to `manual_compression`. The enum
      allows it, so no backlog item is needed.
  - **Audit trail:** one `procedure_events` row per corrected procedure (12 in all), event
    `data_corrected`, with a payload naming the fields changed and "owner-approved synthetic data
    correction 2026-10-15".
  - **Verified on production afterwards:**
    - 0 seeded discharges without red flags, and all 11 texts are identical to the seed builder's;
    - 005 at 15:10 with `manual_compression`;
    - 12 events, 0 triggers left disabled;
    - PCI-2026-021 (user-entered) untouched.
  - **FHIR:** all 21 reviewed cases still validate with 0 errors. But see the next item: none of
    the corrected fields is in the Bundle.
- **2026-10-15 (second): GI bleeding is an emergency.** In the 11 standard red-flag lists, "Black
  or bloody stools, or vomiting blood (…)" moved from the contact-within-a-day group to the end of
  the emergency group (owner: haematemesis and melaena on antiplatelets are emergencies). Data
  only, same method as above (`supabase/data-corrections/2026-10-15-2-gi-bleeding-to-emergency.sql`):
  - each update matched the seeded row and its exact previous list;
  - the generator confirmed every change is a pure reorder;
  - the reviewed-record guard on `discharges` was off for those statements only;
  - 11 `data_corrected` events, with the change and the owner-approval note;
  - rehearsed locally first (the guard refused an ordinary edit afterwards, and a second run
    rolled back).

  Verified on production: 11/11 lists identical to the seed builder, 23 `data_corrected` events
  in all, 0 triggers disabled, and PCI-2026-021 untouched. Found in the Telugu native-reader
  check on CAG-2026-018.
- **FHIR export omits complication onset time, haemostasis method and red flags.** The 005
  corrections therefore do not reach the Bundle. Map them when the export is next extended.

## Process

- **Migrations that drop or rename a column ship in three steps:** first deploy code that works
  with both the old and the new shape, then apply the migration, then deploy the clean-up that
  drops support for the old shape. On 2026-10-15, migrating 0005–0007 before the matching code was
  live gave 3–4 minutes of errors on the live site; with a pilot site that would matter.
