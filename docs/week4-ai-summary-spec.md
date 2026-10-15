# Hrudaya — Week 4 Spec: AI discharge summary (English · Telugu · Hindi · Tamil · Kannada · Malayalam) and printable report

> Goal: a reviewed, discharged procedure can produce a **patient-facing discharge summary** in English, Telugu, Hindi, Tamil, Kannada or Malayalam, drafted by Claude from the structured record only, checked by a deterministic audit, edited and **approved by a clinician** before it is saved — plus a **printable A4 procedure report** built without AI.
> Built out of order: Week 3 (ABDM) waits for sandbox credentials. Week 4 depends on nothing from Week 3.

Drop this at `docs/week4-ai-summary-spec.md`. Read `docs/week1-spec.md` §3 and `docs/week2-fhir-spec.md` §3–4 first; the loader from Week 2 (`lib/fhir/load.ts`) is reused.

## Corrections after build (15 Oct 2026)

The sections below are left as originally written. What was built differs in these places:

- **§2 `max_tokens`: 6000, not 1500.** The first eval sample (PCI-2026-001, six languages) was cut
  off at 1500 for Kannada and Malayalam, and Tamil used 1485, so it was raised to 3000. In the v3
  eval the longest Kannada draft used 2,938 of 3,000, so it went to 4000. In the v4 eval, with the
  standard red flags added, it used 3,902 of 4,000 (9 of 19 Kannada drafts were over 3,500), so it
  went to 6000. These scripts
  take about 5.5 tokens a word. The limit is a ceiling, not a target: English still uses about 800.
  A draft cut off at the limit is refused and never stored. (Owner decisions, both 15 Oct 2026.)
- **§5.2 `section_missing` / `section_extra`:** the expected count follows the record. The
  "When to come back urgently" section is expected only when the record has red flags; likewise
  "Looking after yourself" only with advice, and "Your heart pump" only with an LVEF. In the first
  run the model rightly left out the red-flag section for the 11 seeded discharges that record
  none, and the flat 8/9 rule flagged it. The prompt is unchanged (v1).
- **§5.1 prompt is now v2.** v1 sometimes wrote "When to come back urgently" with no red flags
  recorded, and once "Your heart pump" with no LVEF. v2 leaves empty sections out and never says
  something does not apply. Warnings went from 37 to 0 (`docs/ai-summary.md` → Eval).
- **§5.1 prompt v3** (live review):
  - how often and for how long are in the patient's language, with the abbreviation in
    brackets ("రోజుకు ఒకసారి (OD)"). Guard 4 now covers drug names, doses and units only;
  - one plain sentence explains DAPT;
  - a complication is mentioned only when its outcome is supplied. Outcomes are free text today,
    so none is.
- **§5.1 prompt v4:** complications are described together with their outcome; red flags may carry
  urgency headings.
- **§5.1 prompt v5:** the red-flag sentence no longer names "108". v4's "Keep 108 and every number
  as given" made the model add "call 108" to PCI-2026-001, whose record does not contain it, and
  the audit blocked both drafts. Numbers in that section now come only from the record's red-flag
  items. The prompt was frozen after v5, pending native-reader feedback. That was superseded by v6
  after the Telugu read-through.
- **§5.1 prompt v6** (Telugu native-reader feedback):
  - the DAPT sentence names both DAPT medicines;
  - durations are translated, with the figure kept;
  - specific findings keep their specific wording.

  **Frozen at v6.** v6 eval: 114/114 generated, 0 flags.
- **§2 `temperature`: not sent.** `claude-sonnet-5-5` rejects any non-default sampling value with a
  400, so `temperature: 0` cannot be used. Details are in `docs/ai-summary.md` → Decisions.

---

## 0. Why this week matters (read this, Pavan)

Weeks 1–2 made the record structured and portable. Week 4 makes it **useful to the patient** — and shows you understand the one thing hospitals fear about AI in clinical documents: *it makes things up*. Hrudaya's answer is not "trust the model". It is four guards, in order:

1. **The model only sees structured fields** — the same rows that feed the FHIR Bundle. No free text, no whole database, no name, no date of birth, no identifiers.
2. **A deterministic audit after generation**: every drug in `discharge_medications` must appear in the draft; every number in the draft must exist in the input. Anything else is flagged in the UI before a human reads it.
3. **A clinician edits and approves.** Nothing is "the discharge summary" until a named clinician signs it. Until then every screen says *AI draft — not reviewed*.
4. **Drug names and doses are never translated or transliterated.** "Ticagrelor 90 mg BD" is the same string in all three languages. A translated drug name is a dispensing error waiting to happen.

Interview line: *"The model drafts, the code audits, the clinician signs. Each guard is a separate file you can read."*

### Vocabulary

| Term | Meaning here |
|---|---|
| **Summary input** | The PHI-minimal JSON object built from the record and sent to the model. Hashed and stored. |
| **Draft** | The model's output, Markdown, stored verbatim. Never shown without the banner. |
| **Audit** | Deterministic checks on the draft (§5). Produces a list of flags; never edits the text. |
| **Approved text** | What the clinician saved after editing. Immutable once approved. |
| **Prompt version** | A string constant (`v1`) stored with every draft, so a change to the prompt is visible in the data. |
| **Print report** | The A4 procedure report page, rendered from the database by a template. No AI anywhere in it. |

---

## 1. What Week 4 delivers

1. **Migration 0008** (additive only): `discharge_summaries` table + trigger rows in `procedure_events`.
2. **Summary input builder** `lib/summary/input.ts`: pure function, record → PHI-minimal input object. Reuses `lib/fhir/load.ts`.
3. **Prompt** `lib/summary/prompt.ts`: system prompt + `PROMPT_VERSION`. One place, versioned.
4. **Generator** `lib/summary/generate.ts`: calls the Claude API server-side, stores draft, input hash, model, tokens.
5. **Audit** `lib/summary/audit.ts`: pure function, (input, draft) → flags.
6. **API routes**: `POST /api/procedures/[id]/summary` (generate), `PUT …/summary/[summaryId]` (save edit / approve).
7. **UI** on the report page: Discharge summary card (§7).
8. **Print report** `/procedures/[id]/print` (§8) with Telugu and Devanagari fonts.
9. **Eval run**: all 20 seeded discharged cases × 3 languages, audit flags tabulated in `tmp/summaries/report.md`.
10. **Docs**: `docs/ai-summary.md` — the guards, the prompt, the audit rules, the eval table. CV artefact.

Not in Week 4: clinician-facing AI text (the clinician report is deterministic), voice, translation of the UI itself, any AI on draft/unreviewed procedures, any AI on procedures without a discharge row, fine-tuning, streaming.

---

## 2. Stack additions

Allowed new dependency: **`@anthropic-ai/sdk`** only. Ask before anything else.

Env: `ANTHROPIC_API_KEY` — server-side only, **never** `NEXT_PUBLIC_`, never read in a client component, never logged. Pavan sets it in `.env.local` and in Vercel (plain environment variable). If it is missing, the Generate button is disabled with "AI summary not configured on this server" — the app must still build and run without it.

Model: use the current Sonnet-class model. Check https://docs.claude.com/en/docs/about-claude/models for the exact model string before coding; put it in one constant `SUMMARY_MODEL` in `prompt.ts`, and store it on every row. `max_tokens: 1500`, `temperature: 0`.

Fonts: `next/font/google` — Noto Sans (Latin), Noto Sans Telugu, Noto Sans Devanagari, Noto Sans Tamil, Noto Sans Kannada, Noto Sans Malayalam. Loaded only on the summary card and the print page, and only the font for the language being shown.

---

## 3. Data model — migration 0008 (additive)

```sql
create type public.summary_language as enum ('en', 'te', 'hi', 'ta', 'kn', 'ml');
create type public.summary_status   as enum ('draft', 'approved');

create table public.discharge_summaries (
  id                      uuid primary key default gen_random_uuid(),
  procedure_id            uuid not null references public.procedures (id) on delete cascade,
  language                public.summary_language not null,
  version                 integer not null check (version >= 1),
  status                  public.summary_status not null default 'draft',
  model                   text not null,
  prompt_version          text not null,
  input_hash              text not null,            -- sha256 of canonical input JSON
  draft_text              text not null,            -- model output, verbatim, never edited
  audit_flags             jsonb not null default '[]',
  approved_text           text,                     -- clinician's final text
  approving_clinician_id  uuid references public.operators (id),
  approved_by             uuid references auth.users (id),
  approved_at             timestamptz,
  tokens_in               integer,
  tokens_out              integer,
  generated_by            uuid references auth.users (id) default auth.uid(),
  generated_at            timestamptz not null default now(),
  unique (procedure_id, language, version),
  check (status = 'draft' or (approved_text is not null and approving_clinician_id is not null and approved_at is not null))
);
```

Rules (enforce in SQL where possible, in code otherwise):

- Only for `procedures.status = 'reviewed'` **and** a `discharges` row exists. Checked in the route; also a trigger that refuses insert otherwise.
- A new generation for the same (procedure, language) creates **version + 1**. Old versions are kept. The UI shows the latest; approved versions are listed below it.
- `approved` rows are immutable: an `update` trigger refuses any change to an approved row. To change an approved summary, generate (or write) a new version and approve that.
- `draft_text` is never updated after insert. Clinician edits go to `approved_text` only.
- `procedure_events` gets `summary_generated` and `summary_approved` rows via trigger (same pattern as 0005), payload: language and version.
- RLS: authenticated can select and insert; update only while `status = 'draft'`; no delete.

Deploy order (docs/backlog.md process rule): migration first — it is additive and nothing live reads it — then code.

---

## 4. Summary input (`lib/summary/input.ts`)

`buildSummaryInput(loaded: LoadedProcedure): SummaryInput` — pure, deterministic, key order fixed, so the hash is stable.

Included (and nothing else):

| Section | Fields |
|---|---|
| `patient` | `age_years` (computed from DOB at procedure date), `sex`. **No name, no DOB, no MRN, no ABHA, no phone.** |
| `episode` | `case_code`, `indication` (display text), `urgency`, `admitted_at` (date only), `discharged_at` (date only), `facility_name`, `cath_lab_name` |
| `risk_factors` | list of display names only |
| `access` | site, side, sheath size |
| `findings` | per vessel: vessel display name, stenosis %, TIMI flow, lesion notes **excluded** (free text) |
| `interventions` | per intervention: vessel, type (PCI / POBA / DCB…), residual stenosis %, final TIMI |
| `devices` | per device: category, name, size string. **Lot, expiry, UDI excluded** — not for the patient leaflet. |
| `measurements` | LVEF (`recorded` state only — if `not_recorded`/`not_performed`, key is omitted entirely), contrast mL, fluoro min |
| `complications` | display name + onset, or empty list |
| `discharge` | `clinical_status`, `follow_up_date`, `follow_up_clinic`, `advice[]`, `red_flags[]`, `dapt_planned_months`, `dapt_review_date` |
| `medications` | per discharge medication: `drug_name`, `dose`, `unit`, `frequency`, `route`, `is_dapt`, `duration` if present. Exactly as stored. |
| `operator` | `"Dr <name>"` and role — the clinician's name **is** appropriate on a patient document |

Nulls: a null field is **omitted**, never sent as `null` or `"Not recorded"`. The model is told that anything absent was not recorded and must not be guessed.

`inputHash = sha256(JSON.stringify(input))`. Stored on the row. If the procedure's `updated_at` chain changes later, the UI compares a fresh hash with the stored one and shows "Record changed since this draft — regenerate".

---

## 5. Prompt and audit

### 5.1 Prompt (`lib/summary/prompt.ts`)

`PROMPT_VERSION = 'v1'`. System prompt, fixed text, in English for all three languages. Must contain, in this order:

1. Role: you write a discharge summary **for the patient and their family**, from a cath lab record, for a hospital in India.
2. Language instruction: write the body in `{language}` (English / Telugu / Hindi / Tamil / Kannada / Malayalam). **Drug names, doses, units, frequencies (OD/BD/TDS), the case code, dates, percentages and vessel abbreviations (LAD, LCX, RCA, LMCA) stay exactly as given, in Latin script and Western digits.** Explain a vessel abbreviation once in brackets in the target language on first use.
3. Facts rule: use **only** the JSON provided. Never add a drug, dose, finding, number, diagnosis, advice or risk that is not in it. If something is absent, say nothing about it — do not write "not recorded".
4. Fixed section order, headings in the target language, Markdown `##`:
   1. Why you were in hospital (diagnosis, in plain words)
   2. What was done (access, angiogram, any stent — count and vessel)
   3. What we found (vessels and % narrowing, plain language)
   4. Your heart pump (only if LVEF present)
   5. Your medicines — a Markdown table with the **exact** rows supplied: Drug | Dose | How often | For how long. DAPT drugs marked. One sentence: do not stop these without asking your cardiologist.
   6. Looking after yourself (the `advice[]` items, reworded gently, nothing added)
   7. When to come back urgently (the `red_flags[]` items, nothing added)
   8. Follow-up (date, clinic)
   9. Your team (operator, facility)
5. Tone: calm, respectful, plain words, short sentences, second person. Reading level of a newspaper. No reassurance that isn't in the record ("your heart is fine now" is forbidden unless clinical_status says so).
6. Length: under 450 words of body text in English; the Indian languages may be longer.
7. Output: Markdown only. No preamble, no closing remarks, no signature line.

User message: the input JSON, nothing else.

### 5.2 Audit (`lib/summary/audit.ts`)

`auditDraft(input, draft): AuditFlag[]` — pure. `AuditFlag = { code, severity: 'error'|'warning', detail }`.

| Code | Rule | Severity |
|---|---|---|
| `drug_missing` | A `medications[].drug_name` does not appear in the draft (case-insensitive substring). | error |
| `drug_extra` | A token matching a known drug list (`lib/summary/drug-list.ts`, ~60 common cardiology drugs) appears in the draft but not in input. | error |
| `number_unknown` | A number in the draft (integers/decimals, excluding section numbering and dates already in input) is not present anywhere in the input's numeric values. | error |
| `dose_mismatch` | For each medication, the pattern `<drug> … <dose> <unit>` within 60 chars is not found. | error |
| `section_missing` | Fewer than 8 `##` headings (9 if LVEF present). | warning |
| `section_extra` | More than expected headings. | warning |
| `script_check` | Language is not `en` and the body contains fewer than 70 % characters in the expected Unicode block — Telugu U+0C00–0C7F, Devanagari U+0900–097F, Tamil U+0B80–0BFF, Kannada U+0C80–0CFF, Malayalam U+0D00–0D7F — excluding the medicines table and Latin-script tokens. | warning |
| `forbidden_phrase` | Draft contains any of a small list: "not recorded", "unknown", "N/A", "as an AI", "I cannot". | warning |
| `too_long` | Over 700 words (any language, counted on whitespace). | warning |

Flags are stored on the row and shown in the card. **An `error` flag disables Approve** until the clinician edits the text and the audit (re-run on `approved_text` on save) is clean of errors. Warnings do not block.

---

## 6. API

- `POST /api/procedures/[id]/summary` body `{ language: 'en'|'te'|'hi'|'ta'|'kn'|'ml' }`
  - 401 unauthenticated · 404 unknown · 409 not reviewed or no discharge · 503 if `ANTHROPIC_API_KEY` unset · 429 if the caller has generated ≥ 20 summaries today (count rows by `generated_by` and `generated_at`).
  - Builds input, calls model, runs audit, inserts row (version = max + 1), returns the row.
  - Never logs the input or the draft. Logs: procedure id, language, version, tokens, latency, flag codes.
- `PUT /api/procedures/[id]/summary/[summaryId]` body `{ approved_text, approving_clinician_id, approve: true }`
  - Re-runs audit on `approved_text`; refuses with 422 if any `error` flag. On success sets status `approved`, `approved_by = auth.uid()`, `approved_at = now()`.
  - 409 if already approved.

Both routes use the server Supabase client (RLS applies) — no service-role key, same as Week 2.

---

## 7. UI — report page card

Only on `reviewed` procedures that have a discharge; otherwise the card shows one line: "Discharge summary available after clinical review and discharge".

**Discharge summary** card:
- Language select (six options): English · తెలుగు · हिन्दी · தமிழ் · ಕನ್ನಡ · മലയാളം. A select, not a row of buttons — six don't fit at phone width.
- **Generate draft** button (disabled with reason if key missing or daily cap hit). Spinner with "Drafting… usually 10–20 seconds".
- Draft view: red banner **AI draft — not reviewed. Do not give to patient.** Audit flags listed under it (errors red, warnings amber, each with its detail). The Markdown rendered below, in the right font.
- **Edit** → textarea (same font) with the draft pre-filled; **Approving clinician** select (operators); **Approve and save**. Disabled while error flags exist; re-audits on click.
- Approved view: green banner **Approved by Dr X · 15 Oct 2026 14:32 · v2 · {language}**, the approved text, a **Print** link (opens §8 with this summary), and a "Regenerate (new version)" link.
- Version list: small table of all versions for this procedure/language: version, status, generated at, approved by.
- Mobile-safe; every script must wrap correctly at phone width (test with the longest draft in each language).

---

## 8. Print report — `/procedures/[id]/print`

Server-rendered, auth required, **reviewed procedures only**. Deterministic template from the database; no AI. `@media print` A4, 18 mm margins, page numbers, "Synthetic data — Hrudaya demo" in the footer of every page.

Pages:
1. **Procedure report** (clinician-facing, English): facility header, case code, patient age/sex (no name — synthetic set has names, but the print page shows `MRN` and initials only), indication, urgency, access, findings table, interventions, devices table **with** lot/expiry/UDI, medications given, measurements (three-state rule → "Not recorded"/"Not performed"), complications, operator, reviewing clinician + reviewed time. Matches the on-screen report exactly.
2. **Discharge summary** — one page per **approved** summary (any language), with the approval line at the foot. Unapproved drafts are never printed; if none approved, this page is omitted.

"Download PDF" is the browser's print-to-PDF; no PDF library.

---

## 9. Definition of done

- [ ] Migration 0008 applied on Supabase before code deploy; app runs with and without `ANTHROPIC_API_KEY`
- [ ] `buildSummaryInput` unit-tested: no name/DOB/MRN/lot/UDI in output for any seeded case; omitted keys for null; stable hash across two builds
- [ ] `auditDraft` unit-tested with hand-written drafts: a missing drug, an extra drug, an invented number, a dose mismatch, a clean draft (English plus at least Telugu; `script_check` tested for all five scripts)
- [ ] Generate works live for PCI-2026-001 in all six languages; Approve blocked while an error flag exists; approved row immutable (trigger tested)
- [ ] Eval: every seeded discharged case × 6 languages generated once (~100 calls); `tmp/summaries/report.md` tabulates flags per case/language; zero `drug_missing`/`drug_extra` after prompt fixes, and every `number_unknown` either fixed in the prompt or explained
- [ ] Print page renders A4 from Chrome on Mac and phone; glyphs correct in print preview for all five Indian scripts (conjuncts and vowel signs render, no boxes)
- [ ] `docs/ai-summary.md` written: the four guards, full prompt text, audit table, eval table, cost per summary (from stored tokens)
- [ ] Pavan has read the Telugu drafts for at least five cases and marked each: accurate / wrong / unclear, with notes — that list goes into `docs/ai-summary.md` as "Clinical read-through". Tamil, Kannada and Malayalam are marked **"not yet read by a native speaker"** in the docs until someone who reads them has done the same — do not claim otherwise.

---

## 10. Claude Code prompt

```
Read docs/week4-ai-summary-spec.md, then docs/week1-spec.md §3 and docs/week2-fhir-spec.md §3–4. Week 2 is shipped; the only schema change allowed is the additive migration in spec §3. Build Week 4 in this order, committing after each step, pushing at the end:

1. Migration supabase/migrations/0008_discharge_summaries.sql exactly per §3: enums, table, RLS, refuse-insert trigger (reviewed + discharge required), immutable-when-approved trigger, procedure_events rows. Regenerate lib/database.types.ts. Stop and tell me when it is ready to apply — I will apply it before you continue.
2. lib/summary/input.ts (buildSummaryInput + inputHash) reusing lib/fhir/load.ts. Tests per §9.
3. lib/summary/prompt.ts (SUMMARY_MODEL — check docs.claude.com for the current Sonnet model string, PROMPT_VERSION='v1', system prompt per §5.1, buildMessages). lib/summary/drug-list.ts. lib/summary/audit.ts per §5.2 with tests per §9.
4. Add @anthropic-ai/sdk. lib/summary/generate.ts: server-only, reads ANTHROPIC_API_KEY, temperature 0, max_tokens 1500, stores row with tokens. Never log input or output text.
5. API routes per §6 with tests (mock the Anthropic client; test 401/404/409/503/429/422).
6. Report page card per §7, with the six Noto Sans fonts via next/font/google (load only the one in use). Mobile-safe.
7. Print page per §8.
8. scripts/summary-eval.ts + npm run summary:eval: generate every seeded discharged case × en/te/hi/ta/kn/ml once (this costs real money — print the estimated token count and ask me before running), write tmp/summaries/<case>.<lang>.md and tmp/summaries/report.md (flags per case/language). tmp/ is gitignored. Fix prompt issues the audit reveals; bump PROMPT_VERSION if the prompt changes after the first run.
9. docs/ai-summary.md per §9 and README "Week 4 — AI discharge summary" section. Update docs/backlog.md with anything deferred.

Rules: ANTHROPIC_API_KEY is server-side only and never NEXT_PUBLIC_. Never put patient name, DOB, MRN, lot, expiry or UDI in the model input. Ask before any dependency beyond @anthropic-ai/sdk. When done, give me: the eval flag table, cost per summary, and a phone test list.
```

## 11. Pavan's week

- Day 1: create the Anthropic API key, put it in `.env.local` as `ANTHROPIC_API_KEY` and in Vercel (not `NEXT_PUBLIC_`). Paste the prompt. Apply migration 0008 when Claude Code stops at step 1.
- Day 2: while it builds, write out — in your own words — the four guards from §0. That is the interview answer to "how do you stop AI hallucinating in a clinical document?"
- Day 3: eval runs. Open the Telugu drafts for PCI-2026-001, 005, 010, CAG-2026-018 and one STEMI. Read each as if you were the patient's son. Mark accurate / wrong / unclear with a note. This is the most valuable thing you do this week: you are the only person on the project who can judge the Telugu.
- Day 4: phone test; approve one summary in each language; print PCI-2026-001 to PDF and check every script page renders (no boxes). Ask a Kannada-, Tamil- or Malayalam-reading friend to read one draft each and tell you accurate / wrong / unclear; record their verdicts in docs/ai-summary.md.
- Day 5: 60-second video #3 — "Hrudaya drafts a discharge summary in Telugu; the audit catches an invented number; the cardiologist approves". Send it to me in chat first; I post only after your approval.
