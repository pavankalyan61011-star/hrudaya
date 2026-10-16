# Hrudaya — Week 6 Spec: Amending a reviewed procedure

> Goal: a clinician can correct a **reviewed** procedure — a wrong discharge dose, a missed device lot number — through a controlled path: state a reason, unlock, change, re-review. The original signed record is kept, every change is listed, downstream outputs (FHIR, discharge summaries, print) show that an amendment happened. Nothing can be changed silently, and nothing can be changed without a second signature.
> Why: Week 5 found that reviewed records are read-only with no way back. Two synthetic corrections on 15 Oct had to be made with one-off SQL. A hospital cannot work that way, and "how do you correct a signed record?" is the first question a hospital IT reviewer asks.

Drop this at `docs/week6-amendments-spec.md`. Read `supabase/migrations/0005_dapt_meds_signoff_times.sql` (review guards, `guard_reviewed_child`, event log) and `docs/week4-ai-summary-spec.md` §4 (input hash) first.

## Corrections after build (16 Oct 2026)

The sections below are left as originally written. What was built differs in these places; the
write-up is [amendments.md](amendments.md).

- **§2 "migration 0009" is two files: `0009_amending_status.sql` and `0010_amendments.sql`.** The
  Supabase CLI applies only files named `<digits>_name.sql`, so `0009a`/`0009b` were silently
  skipped. Step A is still its own file, applied before Step B.
- **§2 / §3 the lock covers more than identity fields.** While a procedure is amending:
  - case code, procedure date and `patient_id` are refused by `guard_procedure_review`;
  - the **whole patient row and the patient's risk factors** are refused by a new trigger,
    `guard_patient_during_amendment`.

  The patient row is shared with the patient's other procedures, so editing any of it would
  change records that are not being amended. The capture form shows step 1 read-only.
- **§2 the snapshot is built in SQL (`procedure_snapshot`), and TypeScript builds the same
  thing.** Parity holds for 20/20 local and 21/21 production cases. The one-direction fallback
  wasn't needed. Not exercised: intervention ordering, because no case has two interventions on
  the same lesion and type.
- **§2 completeness on close** reuses `check_procedure_completion`, which now also fires on
  `amending → reviewed`, rather than attempting a transition to `completed`.
- **§2 `close_amendment` stamps the second signature through the trigger.** `reviewed_by` and
  `reviewed_at` are set by `guard_procedure_review` on the way out of `amending`, as they are for
  a first review.
- **§2 the generic `reviewed` / `reopened` events are not logged** for `reviewed ⇄ amending`;
  only `amendment_opened` and `amendment_closed` are.
- **§4 the diff isn't sent from the client unchecked.** "Save and review changes" on the last
  step opens a signing page (`/procedures/[id]/amendment`). There, the server computes the list
  from the stored snapshot. On close, the server recomputes it again and signs only if it equals
  what the clinician was shown; otherwise it answers 409 with the fresh list. The SQL lying-diff
  check still applies on top.
- **§4 "opened by <user>"** shows "you (email)" for the signed-in user and "another user"
  otherwise. Logins have no display names yet (backlog).
- **§4 while amending, summaries are paused.** The summary card says "Discharge summaries are
  paused while an amendment is open. They return when the record has been re-reviewed." Generation
  is refused with 409.
- **§4 "Reviewed · amended ×N" counts amendments that changed something.** An amendment closed
  with no changes is listed in the Amendments card ("No changes"), but the badge and FHIR still
  say reviewed / `final`, as §5 does.
- **§4 the Superseded banner names the amendment**: "Superseded — record amended on <date>
  (amendment #N)". A superseded summary has no Print link.
- **§5 Provenance validated, so it was kept.** `UPDATE` was checked on tx.fhir.org; its display is
  "revise". The bundle gains 2 warnings: `reason` is text with no PurposeOfUse code, and dom-6.
  Both are explained in `fhir-mapping.md`. The Amendments section's narrative lists every closed
  amendment, including no-change ones; its entries are the Provenances.
- **§6 end to end** used one real Generate (English, PCI-2026-005), approved by the owner as the
  only model call this week.

---

## 0. Why this week matters (read this, Pavan)

Every clinical record system has to answer one question honestly: *what happens when the signed record is wrong?* The bad answers are "nothing can change" (so people keep paper corrections on the side) and "anyone can edit" (so the signature means nothing). The good answer is the one paper notes have used for a century: **strike through, write the correction, sign and date it, keep the original legible.** Week 6 is that, in software:

1. **Reason first.** You cannot unlock a reviewed record without writing why. The reason is stored forever.
2. **The original is kept.** A full snapshot of the record is taken at the moment of unlocking. The diff between snapshot and re-reviewed record is computed and stored — field by field, old and new.
3. **Second signature.** An amended record is not valid until a clinician reviews it again. The amendment shows who opened it and who closed it.
4. **Downstream knows.** FHIR Composition status becomes `amended`; discharge summaries approved before the amendment are marked superseded and are not printed; the report shows an Amendments card.

Interview line: *"We never edit a signed record. We open an amendment with a reason, keep the snapshot, and the clinician signs the diff."*

---

## 1. What Week 6 delivers

1. **Migration 0009**: status value `amending`; table `procedure_amendments`; two SQL functions (`open_amendment`, `close_amendment`); guard changes so edits are allowed only while `amending`; events `amendment_opened` / `amendment_closed`.
2. **Snapshot + diff**: `lib/amendments/snapshot.ts` (record → canonical JSON, reusing `lib/fhir/load.ts`) and `lib/amendments/diff.ts` (snapshot ⇄ current → field-level change list).
3. **UI**: *Amend* button on a reviewed report (reason dialog) → the existing capture steps, now editable in `amending` → *Complete and re-review* (clinician select) → report shows the **Amendments** card and a `Reviewed · amended ×N` badge.
4. **Discharge summaries**: approved summaries whose `input_hash` no longer matches are shown and printed as **superseded**; a new draft is one tap away.
5. **FHIR**: `Composition.status = "amended"` once any closed amendment has changes; a `Provenance` resource per closed amendment (who, when, reason, what changed) — only if it validates with 0 errors; otherwise record the amendment in `Composition.event` and backlog Provenance.
6. **Tests, docs** (`docs/amendments.md`), README section, spec corrections as usual.

Not in Week 6: roles/permissions (single role remains — backlog), cancelling an amendment with rollback (an amendment with no changes is simply closed with an empty diff), amending patient identity fields (name, DOB, MRN — those stay locked; backlog), amendments to discharge summaries themselves (they are versioned already), bulk corrections.

---

## 2. Data model — migration 0009 (additive)

```sql
-- Step A (its own statement, outside any transaction block, as 0005 did for 'reviewed'):
alter type public.procedure_status add value if not exists 'amending' after 'reviewed';

-- Step B:
create type public.amendment_status as enum ('open', 'closed');

create table public.procedure_amendments (
  id                               uuid primary key default gen_random_uuid(),
  procedure_id                     uuid not null references public.procedures (id) on delete cascade,
  amendment_no                     integer not null check (amendment_no >= 1),
  status                           public.amendment_status not null default 'open',
  reason                           text not null check (length(btrim(reason)) >= 10),
  opened_by                        uuid references auth.users (id),
  opened_at                        timestamptz not null default now(),
  snapshot                         jsonb not null,              -- canonical record at unlock (lib/amendments/snapshot.ts shape)
  previous_reviewed_at             timestamptz not null,
  previous_reviewing_clinician_id  uuid references public.operators (id),
  closed_by                        uuid references auth.users (id),
  closed_at                        timestamptz,
  reviewing_clinician_id           uuid references public.operators (id),   -- who re-reviewed
  changes                          jsonb,                       -- [{path, label, before, after}], computed at close
  unique (procedure_id, amendment_no),
  check (status = 'open' or (closed_at is not null and reviewing_clinician_id is not null and changes is not null))
);
```

Rules, all enforced in SQL:

- **At most one open amendment per procedure** (partial unique index on `(procedure_id) where status = 'open'`).
- **`open_amendment(p_procedure_id uuid, p_reason text) returns uuid`** — `security definer`, `set search_path = ''`. Refuses unless the procedure is `reviewed`. Inside one transaction: sets `set_config('hrudaya.amending', 'on', true)`; inserts the amendment row with `snapshot` built **in SQL** from the same tables the loader reads (a `jsonb_build_object` over procedure + children, ordered deterministically); copies `reviewed_at` / `reviewing_clinician_id` into `previous_*`; updates `procedures.status = 'amending'` and clears `reviewed_by/at` and `reviewing_clinician_id`. Returns the amendment id.
- **`close_amendment(p_procedure_id uuid, p_reviewing_clinician_id uuid, p_changes jsonb) returns void`** — refuses unless status is `amending` and an open amendment exists; refuses if the record fails the same completeness check as `completed` (reuse the CHECK by attempting the transition); sets `status = 'reviewed'`, `reviewed_by = auth.uid()`, `reviewed_at = now()`, `reviewing_clinician_id`; closes the amendment with `closed_by`, `closed_at`, `changes = p_changes`. The app computes `p_changes` from the snapshot and the current record (lib/amendments/diff.ts); the function additionally **recomputes the snapshot of the current record and refuses to close if `p_changes` is empty but the records differ, or non-empty but they are identical** — so the stored diff can't lie.
- **Guards**: `guard_procedure_review` and `guard_reviewed_child` now treat `amending` like `draft` for edits (children insertable/updatable; procedure fields updatable), keep refusing when `reviewed`, and allow the `reviewed → amending` and `amending → reviewed` transitions **only** when `current_setting('hrudaya.amending', true) = 'on'` — i.e. only via the two functions. Direct `update procedures set status = 'amending'` is refused. RLS delete policies that use `procedure_is_draft` get a sibling `procedure_is_editable` = draft **or** amending.
- **Events**: `amendment_opened` (payload: amendment_no, reason) and `amendment_closed` (payload: amendment_no, change_count, reviewing_clinician_id) via the existing `log_procedure_event` pattern. `data_corrected` events from 15 Oct stay as they are.
- **Status display** everywhere: `amending` renders as **"Amendment in progress"** (amber), never as "Draft". The print page and FHIR export refuse `amending` the same way they refuse `draft` (409 / disabled with the reason).

Deploy order (backlog process rule): Step A alone, then Step B, both before any code that references them; code already tolerates an unknown status by rendering it as read-only.

---

## 3. Snapshot and diff (`lib/amendments/`)

- `snapshotProcedure(loaded): Snapshot` — canonical JSON with stable key order and sorted child arrays (by natural key: vessel, intervention order, drug name…), so two snapshots of an unchanged record are byte-identical. **Must equal the SQL-built snapshot** for every seeded case (test) — if the shapes can't be made identical, the SQL function builds the snapshot and the TS side only reads it; say so in Corrections.
- `diffSnapshots(before, after): Change[]` where `Change = { path: string; label: string; before: unknown; after: unknown; kind: 'changed' | 'added' | 'removed' }`. Labels are human-readable ("Discharge medication · Aspirin · dose", "Device · Xience Skypoint 3.5×28 · lot number"), using the same label tables the report uses. Arrays diff by natural key, not index.
- Excluded from diff (not amendable, locked in UI and refused by trigger): `patients.*` identity fields, `case_code`, `procedure_date`, `created_*`. Changing these needs a different process; backlog.

---

## 4. UI

**Report page, reviewed procedure**: next to the status badge, an **Amend** button. Dialog: *"Why is this record being amended?"* — textarea, minimum 10 characters, with the hint *"This reason is kept permanently with the record."* — **Open amendment** / Cancel. On success the page reloads: badge **Amendment in progress**, an amber banner *"Amendment #N opened by <user> on <date>: <reason>"* with an **Edit record** link into the existing capture steps.

**Capture steps while amending**: identical to draft editing, except: patient identity fields read-only with a lock note; the step header shows the amber amendment banner; the final step's button is **Complete and re-review** (clinician select, same as review today) instead of Complete/Mark reviewed. It calls `close_amendment` with the diff computed client-side and shown first as a **"Changes you are signing"** table (label, before, after). If the table is empty, the button reads **Close amendment (no changes)** and the diff stored is `[]`.

**Report page after re-review**: badge **Reviewed · amended ×N**. New **Amendments** card: one entry per amendment — number, reason, opened by/at, re-reviewed by/at, and the changes table. Open amendments show here too, marked in progress.

**Discharge summary card**: an approved summary whose `input_hash` ≠ current hash gets a grey **Superseded — record amended on <date>** banner instead of the green one; its text stays visible; **Regenerate (new version)** is offered prominently. The versions list shows "superseded". The hint added in Week 5 changes to: *"Medicines come from the record. To change a dose, amend the procedure."* (README and reviewer-ux.md too).

**Print page**: superseded summaries are **not printed**; a single line under the procedure report lists them: *"Discharge summary (Telugu, version 4) superseded by amendment #1 on <date> — not printed."* Amendments are printed as a short table after the procedure report (number, date, reason, change count, re-reviewing clinician). The approval line of a printed summary is unchanged.

---

## 5. FHIR

- `Composition.status`: `"final"` → `"amended"` when the procedure has ≥1 closed amendment with non-empty `changes`. (`preliminary` for completed-unreviewed stays.)
- One `Provenance` per closed amendment with changes: `target` = Composition, `recorded` = closed_at, `activity` = `http://terminology.hl7.org/CodeSystem/v3-DataOperation#UPDATE` (verify the code exists via tx.fhir.org before use; if not verifiable, text only), `agent` = re-reviewing Practitioner, `reason` text = the amendment reason, `entity` omitted. Include Provenance in the document Bundle and reference it from a Composition section titled "Amendments".
- Validator must stay at **0 errors** across all cases including an amended one. If Provenance cannot be made to validate in the time available, drop it, keep `Composition.status = amended`, put the amendment list in the Composition's narrative, and backlog Provenance — say so in Corrections.
- `docs/fhir-mapping.md` gains the Provenance / status rows.

---

## 6. Definition of done

- [ ] 0009 applied (Step A then Step B) before code deploy; app builds and runs against both old and new status sets
- [ ] `open_amendment` refuses on draft/completed/amending; requires a ≥10-char reason; snapshot stored; status `amending`; event logged (SQL tests like 0008's)
- [ ] While amending: child rows editable; identity fields refused by trigger; direct status update to/from `amending` refused without the function
- [ ] `close_amendment`: refuses incomplete record; refuses a lying diff (empty-but-different, non-empty-but-identical); sets second signature; event logged; approved-row immutability of summaries untouched
- [ ] Snapshot parity: SQL snapshot = TS snapshot for all 21 cases, or the Corrections note explains the one-direction design
- [ ] Diff tests: dose change, device lot added, complication outcome edited, red-flag item removed, no change → `[]`; arrays matched by natural key
- [ ] End-to-end on local data: amend PCI-2026-005 (change a dose) → re-review → summary shows Superseded → regenerate → new draft has the new dose → print lists the superseded one and prints the new one after approval
- [ ] FHIR: amended case validates 0 errors; `Composition.status = amended`; Provenance present or explicitly backlogged
- [ ] Phone: reason dialog, amber banner, Changes-you-are-signing table and Amendments card all readable at 390 px
- [ ] `docs/amendments.md` (the four ideas in §0, the state diagram draft → completed → reviewed ⇄ amending, the SQL function contracts, screenshots); README "Week 6 — Amendments"; backlog updated (roles, identity-field amendments, cancel/rollback, Provenance if dropped)
- [ ] Owner read-through: Pavan amends one seeded case on his phone with a real reason and signs the diff

## 7. Claude Code prompt

```
Read docs/week6-amendments-spec.md, then supabase/migrations/0005_dapt_meds_signoff_times.sql and docs/week4-ai-summary-spec.md §4. Build Week 6 in this order, committing after each step, pushing at the end:

1. Migration 0009 per spec §2 in two files if Postgres requires it (0009a: add enum value 'amending'; 0009b: table, partial unique index, open_amendment, close_amendment with the lying-diff check, guard changes using current_setting('hrudaya.amending'), procedure_is_editable, events, status display note). SQL behaviour tests in supabase/tests/0009_behaviour.sql covering spec §6's first four items. Regenerate lib/database.types.ts. Stop and tell me when it is ready to apply — I will apply it before you continue.
2. lib/amendments/snapshot.ts and diff.ts per §3 with the parity test and the diff tests in §6.
3. Server actions/API: openAmendment(reason) and closeAmendment(clinicianId, changes) calling the SQL functions through the server Supabase client (RLS, no service role). 401/404/409/422 as in earlier weeks. Tests.
4. UI per §4: Amend button + reason dialog; amber banner; capture steps editable while amending with identity fields locked; Changes-you-are-signing table; Complete and re-review; Amendments card; Reviewed · amended ×N badge; Superseded banner and versions-list state on summaries; print-page changes; the medicines hint text change in the three places.
5. FHIR per §5: Composition.status amended; Provenance only if it validates (verify the activity code against tx.fhir.org first); run npm run fhir:validate across all cases plus one amended case; 0 errors or drop Provenance and document.
6. End-to-end check per §6 on local data; phone-width checks.
7. docs/amendments.md, docs/fhir-mapping.md rows, README Week 6, spec Corrections, backlog. 

No AI calls. Ask before any dependency. When done give me: the SQL test count, the diff test list, the validator result for the amended case, two screenshots (Amend dialog on phone, Amendments card on laptop), and a phone test list.
```

## 8. Pavan's week

- Day 1: paste the prompt; apply 0009 when asked (two statements, Step A first). Write the four §0 ideas in your own words — this is the "how do you correct a signed record?" answer.
- Day 2: phone test. Amend one seeded case with a real reason (e.g. "Discharge ticagrelor dose recorded as 90 mg OD; prescription was 90 mg BD"), change it, sign the diff. Then regenerate its Telugu summary and read the medicines table.
- Day 3: ask the cath lab clinician from Week 5 to do the same on one case and watch where they hesitate. Their hesitation list is the Week 7 input.
- Day 4: ABDM — if credentials have arrived, Week 3 starts; if not, escalate. Native readers for the four languages.
- Day 5: LinkedIn post: the Amendments card screenshot and the §0 line. Text to me first.
