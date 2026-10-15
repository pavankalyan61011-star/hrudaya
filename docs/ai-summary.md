# AI discharge summary (Week 4)

Hrudaya drafts a patient-facing discharge summary in English, Telugu, Hindi, Tamil, Kannada or
Malayalam from a reviewed procedure record. **The model drafts, the code audits, the clinician
signs.** Each of those is a separate file you can read. Synthetic data only.

Spec: [week4-ai-summary-spec.md](week4-ai-summary-spec.md). Where the build differs from the
spec, it is listed under [Decisions](#decisions-that-differ-from-the-spec).

## The four guards

1. **The model sees structured fields only.** [`lib/summary/input.ts`](../lib/summary/input.ts)
   builds the input from the same rows that feed the FHIR Bundle: age, sex, indication, access,
   findings, interventions, device sizes, LVEF (only when recorded), complications, discharge
   advice, red flags and medicines. It contains no name, date of birth, MRN, ABHA, phone, free-text
   notes, device lot, expiry or UDI. Null fields are left out, never sent as "Not recorded". The
   input is hashed (`input_hash`) and stored with each draft. A test checks every seeded case for
   identifiers (`npm run test:seeded`).
2. **A deterministic audit after generation.** [`lib/summary/audit.ts`](../lib/summary/audit.ts):
   - every discharge medicine must appear in the draft;
   - every number in the draft must exist in the input;
   - every dose must follow its drug.

   It never edits the text; it lists flags, and the clinician sees them before reading the draft.
3. **A clinician edits and approves.** Until a named clinician approves, every screen says
   **AI draft — not reviewed. Do not give to patient.** An error flag blocks approval: the audit
   re-runs on the clinician's text, live in the browser and again on the server (422). An approved
   row is immutable by database trigger, and only approved summaries print.
4. **Drug names and doses are never translated.** The prompt keeps drug names, doses, units,
   frequencies (OD, BD, TDS…), dates, percentages and vessel abbreviations in Latin script and
   Western digits in every language. "Ticagrelor 90 mg BD" is the same string in all six.
   `drug_missing` and `dose_mismatch` enforce it: a transliterated drug name fails the audit.

## How a summary is made

| Step | File |
|---|---|
| Record → PHI-minimal input + sha256 | `lib/summary/input.ts` |
| System prompt + one user message (the input JSON) | `lib/summary/prompt.ts` (`PROMPT_VERSION = "v1"`) |
| Claude API call, server-only | `lib/summary/generate.ts` |
| Audit | `lib/summary/audit.ts`, `lib/summary/drug-list.ts` |
| Generate / approve | `POST /api/procedures/[id]/summary`, `PUT …/summary/[summaryId]` (`lib/summary/api.ts`) |
| Card on the report page | `components/report/discharge-summary.tsx` |
| Print (A4, approved only) | `/procedures/[id]/print` |
| Storage | `discharge_summaries` (migration 0008): one row per procedure × language × version |

Request settings: model `claude-sonnet-5-5` (stored per row as the model that answered),
`max_tokens` 3000, `thinking: {type: "between_tools"}` (no extended thinking), server-side
refusal fallback on, no temperature. A draft that comes back cut off at `max_tokens`, refused or
empty is **not stored**. Each user may generate 20 summaries a day (counted from midnight IST).
Logs carry ids, language, version, tokens, latency and flag codes. They never carry the input or
the draft.

`ANTHROPIC_API_KEY` is read on the server only and is never `NEXT_PUBLIC_`. Without it, the app
builds and runs, and the Generate button is disabled with "AI summary not configured on this
server".

## The prompt (v1)

The same English instructions for every language; `{LANGUAGE}` is filled in. The user message is
the input JSON and nothing else.

```text
You write a discharge summary for the patient and their family, from a cardiac catheterisation (cath lab) record, for a hospital in India.

LANGUAGE
Write the body in {LANGUAGE}. Keep these exactly as given, in Latin script and Western digits: drug names, doses, units, frequencies (OD, BD, TDS, QDS, PRN), the case code, dates, percentages and vessel abbreviations (LMCA, LAD, LCX, RCA, and branch names such as D1, OM1, PDA). The first time you use a vessel abbreviation, explain it once in brackets in {LANGUAGE}.

FACTS
Use only the JSON record in the user message. Never add a drug, dose, finding, number, diagnosis, advice or risk that is not in it. Do not calculate, round or estimate new numbers. Anything absent from the record was not recorded: say nothing about it, and never write that something is "not recorded" or "unknown".

SECTIONS
Use exactly these sections, in this order, each as a Markdown "## " heading written in {LANGUAGE}. Do not number the headings and add no other headings.
1. Why you were in hospital: the diagnosis, in plain words.
2. What was done: the access route, the angiogram, and any stent or balloon (how many, and in which vessel).
3. What we found: each vessel and its % narrowing, in plain language.
4. Your heart pump: only if the record has an LVEF value. If it has none, leave this section out entirely.
5. Your medicines: a Markdown table with exactly one row per medicine in the record, in the same order, with the columns Drug | Dose | How often | For how long (column titles may be in {LANGUAGE}). Copy the drug name, the dose with its unit, and the frequency exactly as given. Write "(DAPT)" after the name of each DAPT medicine. Leave "For how long" empty when the record gives no duration. After the table, write one sentence: do not stop these medicines without asking your cardiologist.
6. Looking after yourself: the advice items, reworded gently. Add nothing.
7. When to come back urgently: the red-flag items. Add nothing.
8. Follow-up: the follow-up date and clinic.
9. Your team: the operator and the facility.

TONE
Calm, respectful, plain words, short sentences, second person ("you"). The reading level of a newspaper. Give no reassurance the record does not contain: for example, do not say the heart is now fine unless the clinical status says so.

LENGTH
Under 450 words of body text in English; the other languages may be longer.

OUTPUT
Markdown only. No preamble, no closing remarks, no signature line.
```

## Audit rules

| Code | Rule | Severity |
|---|---|---|
| `drug_missing` | A discharge medicine's `drug_name` is not in the draft (case-insensitive). | error |
| `drug_extra` | A drug from `drug-list.ts` (~70 cardiology generics) is in the draft but no discharge medicine contains it. | error |
| `number_unknown` | A number in the draft is not anywhere in the input: values, or digit groups inside dates, sizes and the case code. Heading numbering is ignored. Digits in an Indian script are always flagged, because the prompt requires Western digits. | error |
| `dose_mismatch` | A medicine's dose and unit do not follow its name within 60 characters (`Aspirin … 75 mg`). | error |
| `section_missing` / `section_extra` | Not 8 `##` headings (9 when LVEF is in the input). | warning |
| `script_check` | Not English, and under 70% of the non-Latin letters are in the language's Unicode block (Telugu, Devanagari, Tamil, Kannada, Malayalam). The medicines table and Latin tokens are ignored. | warning |
| `forbidden_phrase` | "not recorded", "unknown", "N/A", "as an AI", "I cannot". | warning |
| `too_long` | Over 700 words. | warning |

Tests: `npm test`. Hand-written English and Telugu drafts cover a clean draft, a missing drug, an
extra drug, an invented number and a dose mismatch. `script_check` passes and fails for all five
scripts. The route tests use a mocked model for 401, 404, 409, 503, 429 and 422.

## Eval

`npm run summary:eval` (estimate) → `-- --confirm` (generate) → `-- --reaudit` (re-score saved
drafts, no model call). Run on 15 Oct 2026: every seeded discharged case × six languages, prompt
v1, `max_tokens` 3000. **114 scheduled, 114 generated, 0 failed or cut off.** Only
`claude-sonnet-5-5` answered (the fallback never ran). Flags below are from the current audit.

**Zero error flags in all 114 drafts:** no missing drug, no extra drug, no invented number and no
dose mismatch, in any language.

| Language | Generated | Avg tokens in | Avg tokens out | Max out | Avg $ | With an error flag |
|---|---|---|---|---|---|---|
| English | 19 | 1761 | 701 | 811 | 0.0105 | 0 |
| Telugu | 19 | 1773 | 1352 | 1588 | 0.0171 | 0 |
| Hindi | 19 | 1773 | 1136 | 1287 | 0.0149 | 0 |
| Tamil | 19 | 1773 | 1462 | 1642 | 0.0182 | 0 |
| Kannada | 19 | 1773 | 2275 | 2657 | 0.0263 | 0 |
| Malayalam | 19 | 1777 | 1667 | 1937 | 0.0202 | 0 |

| Flag | en | te | hi | ta | kn | ml | Total |
|---|---|---|---|---|---|---|---|
| section_extra | 4 | 6 | 4 | 10 | 6 | 7 | 37 |

| Case | en | te | hi | ta | kn | ml |
|---|---|---|---|---|---|---|
| CAG-2026-018 | — | section_extra | section_extra | section_extra | section_extra | section_extra |
| CAG-2026-019 | — | — | section_extra | section_extra | — | section_extra |
| PCI-2026-001 | — | — | — | — | — | — |
| PCI-2026-002 | — | — | — | section_extra | — | section_extra |
| PCI-2026-003 | — | — | — | — | — | — |
| PCI-2026-004 | — | — | — | section_extra | — | section_extra |
| PCI-2026-005 | — | — | — | — | — | — |
| PCI-2026-006 | — | — | — | section_extra | — | — |
| PCI-2026-007 | — | — | — | section_extra | section_extra | — |
| PCI-2026-008 | — | — | — | — | — | — |
| PCI-2026-009 | section_extra | section_extra | — | section_extra | section_extra | — |
| PCI-2026-010 | — | — | — | — | — | — |
| PCI-2026-011 | section_extra | section_extra | — | section_extra | section_extra | section_extra |
| PCI-2026-012 | section_extra | section_extra | section_extra | section_extra | section_extra | section_extra |
| PCI-2026-013 | — | — | — | — | — | — |
| PCI-2026-014 | — | section_extra | — | section_extra | section_extra | section_extra |
| PCI-2026-015 | — | — | — | — | — | — |
| PCI-2026-016 | — | section_extra | section_extra | — | — | — |
| PCI-2026-017 | section_extra | — | — | — | — | — |

**What the 37 warnings are.** Every one is the same behaviour: the model wrote a section the
record leaves empty. In 36 the record has no red flags, and the model still wrote "When to come back
urgently". In one (PCI-2026-017, English) the record has no LVEF, and it wrote "Your heart pump"
to say the section does not apply. In the same cases the model leaves the section out about half
the time, which is what the prompt intends. When it does write the section, it usually says the
record lists no warning signs and adds a general "contact your doctor or the hospital if you feel
unwell". That sentence is not in the record. It is benign, but it breaks the FACTS rule, and it
tells the patient "not recorded" in other words.

The cause is in the prompt: v1 says what to do with an empty LVEF (section 4), but not with empty
advice or red flags (sections 6 and 7). **Proposed v2 (not applied, needs owner approval because
it is a paid re-run, about $2):** "Sections 6 and 7 only when the record has items for them;
otherwise leave the section out entirely. Never write that something is missing from the
record." The real fix is in the data: 11 of 19 seeded discharges record no red flags (see
`docs/backlog.md`).

The first sample run (PCI-2026-001 at `max_tokens` 1500) is the reason the limit is now 3000;
see Decisions.

## Cost per summary

Price for `claude-sonnet-5-5`: $2 per million input tokens, $10 per million output
(platform.claude.com, 15 Oct 2026). Input is about 1,770 tokens in every language: the prompt
and the record JSON. Output is what differs, because Indian scripts take several times more tokens
per word than English.

| | Tokens in / out | Cost per summary |
|---|---|---|
| **English**, average of 19 | 1,761 / 701 | **$0.0105** (range $0.0081–$0.0118) |
| **Longest Indian-language case** (PCI-2026-009, Kannada) | 1,847 / 2,657 | **$0.0303** |
| Telugu, average | 1,773 / 1,352 | $0.0171 |
| Hindi, average | 1,773 / 1,136 | $0.0149 |
| Tamil, average | 1,773 / 1,462 | $0.0182 |
| Kannada, average | 1,773 / 2,275 | $0.0263 |
| Malayalam, average | 1,777 / 1,667 | $0.0202 |

The worst case is about 3× English. Kannada is the longest language throughout. All six languages
for one case average $0.107. The full eval cost $2.04 (201,946 in / 163,252 out), plus $0.11 for
the two sample runs before it. Time per summary averages 6 s in English and 9–13 s in the Indian
languages, 24 s at most. The route allows 60 s.

## Clinical read-through

Spec §9: a native reader marks each draft accurate / wrong / unclear, with notes. Until someone
who reads the language has done this, the drafts in that language are unread. The audit checks
drugs, doses and numbers. It cannot judge whether the prose is right.

| Language | Status |
|---|---|
| English | Audit only. Not yet read by a clinician. |
| Telugu | **Pending: Pavan to read five cases** (PCI-2026-001, 005, 010, CAG-2026-018 and one STEMI) |
| Hindi | Not yet read by a native speaker |
| Tamil | **Not yet read by a native speaker** |
| Kannada | **Not yet read by a native speaker** |
| Malayalam | **Not yet read by a native speaker** |

## Decisions that differ from the spec

- **No `temperature`.** The spec asked for 0. `claude-sonnet-5-5` rejects any non-default sampling
  value with a 400. Temperature 0 never guaranteed identical output anyway; the audit is what holds
  a draft to the record.
- **`max_tokens` 3000, not 1500** (owner, 2026-10-15). In the first six-call sample, Kannada and
  Malayalam were cut off at 1500 and Tamil used 1485 of 1500. These scripts take about 5.5 tokens a
  word. It is a ceiling: English still uses about 800.
- **Thinking off** (`between_tools`). Sonnet 5.5 thinks by default, and the thinking would come out
  of the same token budget. This task is transcription from a small JSON record.
- **Server-side refusal fallback** (`fallbacks: "default"`). If it ever runs, the model that wrote
  the draft is the one stored on the row.
- **`procedure_events.payload`** (jsonb, nullable) was added in 0008, because the table had no
  column for the spec's `{language, version}`.
- **Save edit without approving** (`approve: false`) keeps the clinician's text on a draft.
