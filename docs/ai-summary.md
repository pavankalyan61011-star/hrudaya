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
| System prompt + one user message (the input JSON) | `lib/summary/prompt.ts` (`PROMPT_VERSION = "v2"`) |
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

## The prompt (v2)

The same English instructions for every language; `{LANGUAGE}` is filled in. The user message is
the input JSON and nothing else. v2 differs from v1 in two places: the sentence after the
SECTIONS heading, and the last sentence of section 7. The reason is under [Eval](#eval).

```text
You write a discharge summary for the patient and their family, from a cardiac catheterisation (cath lab) record, for a hospital in India.

LANGUAGE
Write the body in {LANGUAGE}. Keep these exactly as given, in Latin script and Western digits: drug names, doses, units, frequencies (OD, BD, TDS, QDS, PRN), the case code, dates, percentages and vessel abbreviations (LMCA, LAD, LCX, RCA, and branch names such as D1, OM1, PDA). The first time you use a vessel abbreviation, explain it once in brackets in {LANGUAGE}.

FACTS
Use only the JSON record in the user message. Never add a drug, dose, finding, number, diagnosis, advice or risk that is not in it. Do not calculate, round or estimate new numbers. Anything absent from the record was not recorded: say nothing about it, and never write that something is "not recorded" or "unknown".

SECTIONS
Use these sections, in this order, each as a Markdown "## " heading written in {LANGUAGE}. Do not number the headings and add no other headings. Sections 4 and 7 are left out entirely when the record has nothing for them. Never write a section to say that something does not apply, is not listed or is not in the record.
1. Why you were in hospital: the diagnosis, in plain words.
2. What was done: the access route, the angiogram, and any stent or balloon (how many, and in which vessel).
3. What we found: each vessel and its % narrowing, in plain language.
4. Your heart pump: only if the record has an LVEF value. If it has none, leave this section out entirely.
5. Your medicines: a Markdown table with exactly one row per medicine in the record, in the same order, with the columns Drug | Dose | How often | For how long (column titles may be in {LANGUAGE}). Copy the drug name, the dose with its unit, and the frequency exactly as given. Write "(DAPT)" after the name of each DAPT medicine. Leave "For how long" empty when the record gives no duration. After the table, write one sentence: do not stop these medicines without asking your cardiologist.
6. Looking after yourself: the advice items, reworded gently. Add nothing.
7. When to come back urgently: the red-flag items. Add nothing. If the record has no red_flags, leave this section out entirely.
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
drafts, no model call). Each run: every seeded discharged case × six languages (19 × 6 = 114),
`max_tokens` 3000. Only `claude-sonnet-5-5` answered in either run; the fallback never ran.

### Before and after: prompt v1 → v2 (15 Oct 2026)

| | v1 | v2 |
|---|---|---|
| Generated / failed or cut off | 114 / 0 | 114 / 0 |
| **Error flags** (drug missing/extra, unknown number, dose mismatch) | **0** | **0** |
| **Warnings** | **37** (all `section_extra`) | **0** |
| "When to come back" written although the record has no red flags (of 66) | 36 | **0** |
| "Your heart pump" written although no LVEF is recorded (of 84) | 1 | **0** |
| English drafts saying something "does not apply" / "was not listed" | 4 | **0** |
| Cost of the run | $2.04 | $1.98 |

**v1 warnings, by language (before):**

| Flag | en | te | hi | ta | kn | ml | Total |
|---|---|---|---|---|---|---|---|
| section_extra | 4 | 6 | 4 | 10 | 6 | 7 | 37 |

**v2 warnings, by language (after):**

| Flag | en | te | hi | ta | kn | ml | Total |
|---|---|---|---|---|---|---|---|
| (none) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**What v1 did.** For a record with no red flags, v1 left the section out about half the time,
which was the intent. The rest of the time it wrote the heading anyway, usually saying the record
lists no warning signs and adding a general "contact your doctor or the hospital if you feel
unwell". That sentence is not in the record. Once (PCI-2026-017, English) it wrote "Your heart
pump" to say there was no LVEF. v1 told the model what to do with a missing LVEF, but not with
missing red flags.

**v2** says that sections 4 and 7 are left out entirely when the record has nothing for them, and
that no section may say something does not apply or is not in the record.

**How the zeros were checked.** The audit counts sections from the record. Separately, a script
read every v2 draft directly: none of the 66 drafts without red flags has the section, none of the
84 drafts without an LVEF mentions LVEF, and no English draft says "not listed" or "does not
apply". The same script run on the saved v1 drafts finds 36, 1 and 4, so the zeros are not an
artefact of the check.

The cost of v2: 11 of the 19 leaflets now have no "When to come back urgently" section at all,
because their records hold no red flags. That belongs in the data, not the prompt: see
`docs/backlog.md`, "Red flags should be required on every discharge".

The first sample run (PCI-2026-001 at `max_tokens` 1500) is why the limit is 3000; see
Decisions.

## Cost per summary

Price for `claude-sonnet-5-5`: $2 per million input tokens, $10 per million output
(platform.claude.com, 15 Oct 2026). Input is about 1,830 tokens in every language: the prompt and
the record JSON. Output is what differs, because Indian scripts take several times more tokens per
word than English. Prompt v2 figures, with v1 for comparison:

| | Tokens in / out (v2) | Cost per summary, v2 | v1 |
|---|---|---|---|
| **English**, average of 19 | 1,827 / 683 | **$0.0105** (range $0.0080–$0.0115) | $0.0105 |
| **Longest Indian-language case** (v2: PCI-2026-012, Kannada) | 1,909 / 2,557 | **$0.0294** | $0.0303 (PCI-2026-009, Kannada) |
| Telugu, average | 1,839 / 1,319 | $0.0169 | $0.0171 |
| Hindi, average | 1,839 / 1,066 | $0.0143 | $0.0149 |
| Tamil, average | 1,839 / 1,358 | $0.0173 | $0.0182 |
| Kannada, average | 1,839 / 2,188 | $0.0256 | $0.0263 |
| Malayalam, average | 1,843 / 1,597 | $0.0197 | $0.0202 |

The worst case is about 3× English, and Kannada is the longest language in both runs. All six
languages for one case average $0.104. Spend so far: v1 run $2.04, v2 run $1.98, sample runs
$0.11. Time per summary averages 5 s in English and 8–13 s in the Indian languages, 18 s at most.
The route allows 60 s.

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
