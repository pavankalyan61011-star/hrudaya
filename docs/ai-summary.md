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
   dates, percentages and vessel abbreviations in Latin script and Western digits in every
   language: "Ticagrelor 90 mg" is the same string in all six. Since prompt v3, how often and for
   how long are written in the patient's language, with the frequency abbreviation kept in
   brackets, for example "రోజుకు ఒకసారి (OD)". A pharmacist can still match it to the
   prescription. `drug_missing` and `dose_mismatch` enforce the rule: a transliterated drug name
   fails the audit.

## How a summary is made

| Step | File |
|---|---|
| Record → PHI-minimal input + sha256 | `lib/summary/input.ts` |
| System prompt + one user message (the input JSON) | `lib/summary/prompt.ts` (`PROMPT_VERSION = "v3"`) |
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

## The prompt (v3)

The same English instructions for every language; `{LANGUAGE}` is filled in. The user message is
the input JSON and nothing else. Versions:

- **v1:** first eval.
- **v2:** empty sections (no red flags, no LVEF) are left out, and no section may say something
  does not apply.
- **v3**, from a live review:
  - how often and for how long are written in the patient's language, with the frequency
    abbreviation in brackets;
  - one plain sentence explains DAPT;
  - a complication is mentioned only when its outcome is supplied.

Each change and its effect is under [Eval](#eval).

```text
You write a discharge summary for the patient and their family, from a cardiac catheterisation (cath lab) record, for a hospital in India.

LANGUAGE
Write the body in {LANGUAGE}. Keep these exactly as given, in Latin script and Western digits: drug names, doses, units, the case code, dates, percentages and vessel abbreviations (LMCA, LAD, LCX, RCA, and branch names such as D1, OM1, PDA). The first time you use a vessel abbreviation, explain it once in brackets in {LANGUAGE}. Write how often a medicine is taken in {LANGUAGE}, in words without digits, followed by the record's abbreviation in brackets: for example "once a day (OD)", "twice a day (BD)", "only when needed (PRN)". Write for how long in {LANGUAGE}, keeping any number in Western digits.

FACTS
Use only the JSON record in the user message. Never add a drug, dose, finding, number, diagnosis, advice or risk that is not in it. Do not calculate, round or estimate new numbers. Anything absent from the record was not recorded: say nothing about it, and never write that something is "not recorded" or "unknown". Do not mention a complication unless its outcome is supplied in the record; a complication without an "outcome" field is not mentioned at all.

SECTIONS
Use these sections, in this order, each as a Markdown "## " heading written in {LANGUAGE}. Do not number the headings and add no other headings. Sections 4 and 7 are left out entirely when the record has nothing for them. Never write a section to say that something does not apply, is not listed or is not in the record.
1. Why you were in hospital: the diagnosis, in plain words.
2. What was done: the access route, the angiogram, and any stent or balloon (how many, and in which vessel).
3. What we found: each vessel and its % narrowing, in plain language.
4. Your heart pump: only if the record has an LVEF value. If it has none, leave this section out entirely.
5. Your medicines: a Markdown table with exactly one row per medicine in the record, in the same order, with the columns Drug | Dose | How often | For how long (column titles may be in {LANGUAGE}). Copy the drug name and the dose with its unit exactly as given. Write "(DAPT)" after the name of each DAPT medicine. In "How often", write the frequency as described under LANGUAGE, with its abbreviation in brackets. Leave "For how long" empty when the record gives no duration. After the table: if any medicine is DAPT, write one plain sentence explaining DAPT — two tablets taken together that stop clots forming in the stent (if the record has no stent, say "in the treated artery" instead). Then write one sentence: do not stop these medicines without asking your cardiologist.
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
`max_tokens` 3000. Only `claude-sonnet-5-5` answered in all three runs; the fallback never ran.

### Before and after: prompt v1 → v2 → v3 (15 Oct 2026)

| | v1 | v2 | v3 |
|---|---|---|---|
| Generated / failed or cut off | 114 / 0 | 114 / 0 | 114 / 0 |
| **Error flags** (drug missing/extra, unknown number, dose mismatch) | **0** | **0** | **0** |
| **Audit warnings** | **37** (all `section_extra`) | **0** | **0** |
| "When to come back" written although the record has no red flags (of 66) | 36 | 0 | 0 |
| "Your heart pump" written although no LVEF is recorded (of 84) | 1 | 0 | 0 |
| English drafts saying something "does not apply" / "was not listed" | 4 | 0 | 0 |
| Frequency with its abbreviation in brackets, e.g. "రోజుకు ఒకసారి (OD)" (of 210 medicine-frequency pairs) | 0 | 0 | **210** |
| English drafts with the DAPT sentence (of 17 with DAPT) | 0 | 0 | **17** |
| …saying "treated artery" where there is no stent (PCI-2026-015) | — | — | **yes** |
| Complication mentioned without an outcome, English (of 2: PCI-2026-005, -010) | 2 | 2 | **0** |
| Complication mentioned without an outcome, Indian languages (of 10) | ≥ 8 | ≥ 8 | **≥ 5** |
| Longest draft, tokens out (limit 3000) | 2,657 | 2,557 | **2,938** |
| Cost of the run | $2.04 | $1.98 | $2.19 |

**Audit warnings by language:**

| Prompt | en | te | hi | ta | kn | ml | Total |
|---|---|---|---|---|---|---|---|
| v1 | 4 | 6 | 4 | 10 | 6 | 7 | 37 |
| v2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| v3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**v1 → v2.** For a record with no red flags, v1 left the section out about half the time. The
rest of the time it wrote the heading anyway, usually saying the record lists no warning signs
and adding a general "contact your doctor or the hospital if you feel unwell". That sentence is
not in the record. Once (PCI-2026-017, English) it wrote "Your heart pump" to say there was no
LVEF. v2 leaves those sections out entirely. Because 11 of the 19 records hold no red flags, those
11 leaflets now have no "When to come back urgently" section. The fix for that is in the data
(`docs/backlog.md`, "Red flags should be required on every discharge").

**v2 → v3** (live review):
- **Frequency and duration** are now in the patient's language, with the abbreviation kept for
  the pharmacist. Telugu is fully consistent: "రోజుకు ఒకసారి (OD)" all 58 times and
  "రోజుకు రెండుసార్లు (BD)" all 14 times. No frequency was written with digits.
- **The DAPT sentence** appears in every English draft that has DAPT. PCI-2026-015 (DAPT with no
  stent) correctly says "in the treated artery".
- **Complications.** The complications table keeps `outcome` and `management` as free text only,
  and free text never reaches the model. So v3 says: do not mention a complication unless its
  outcome is supplied, which today means none. The English drafts now comply. **The Indian-
  language drafts do not reliably comply:** at least 5 of the 10 drafts for PCI-2026-005
  (haematoma) and PCI-2026-010 (no-reflow) still describe the complication, with the English
  term in brackets. "At least", because the check only finds the English term; a mention written
  only in the script would be missed. The complication names are still in the input, and a
  prompt instruction is not a guard. The deterministic fix is to leave a complication out of the
  input until it has a structured outcome. That is not done yet; see `docs/backlog.md`,
  "Structured complication outcome".
- **Headroom.** The longest Kannada draft (PCI-2026-012) used 2,938 of the 3,000-token limit.
  A cut-off draft is refused and never stored, so this is safe, but a slightly longer record
  would fail to generate in Kannada.

**How the counts were checked.** The audit counts sections from the record. Separately, scripts
read every saved draft from all three runs:
- sections the record leaves empty;
- each medicine frequency's `(OD)`/`(BD)`/`(PRN)` in brackets;
- the English DAPT sentence;
- complication terms;
- frequencies written in digits.

Every non-zero number in the table was found by the same script that reports zero for the
other versions, so the zeros are not an artefact of the check.

## Cost per summary

Price for `claude-sonnet-5-5`: $2 per million input tokens, $10 per million output
(platform.claude.com, 15 Oct 2026). Input is about 2,040 tokens in every language under v3: the
prompt and the record JSON. Output is what differs, because Indian scripts take several times more
tokens per word than English. Prompt v3 figures, with v2 and v1 for comparison:

| | Tokens in / out (v3) | Cost per summary, v3 | v2 | v1 |
|---|---|---|---|---|
| **English**, average of 19 | 2,027 / 727 | **$0.0113** (range $0.0084–$0.0126) | $0.0105 | $0.0105 |
| **Longest Indian-language case** (v3: PCI-2026-012, Kannada) | 2,115 / 2,938 | **$0.0336** | $0.0294 | $0.0303 |
| Telugu, average | 2,045 / 1,439 | $0.0185 | $0.0169 | $0.0171 |
| Hindi, average | 2,045 / 1,103 | $0.0151 | $0.0143 | $0.0149 |
| Tamil, average | 2,045 / 1,556 | $0.0197 | $0.0173 | $0.0182 |
| Kannada, average | 2,045 / 2,524 | $0.0293 | $0.0256 | $0.0263 |
| Malayalam, average | 2,051 / 1,704 | $0.0211 | $0.0197 | $0.0202 |

v3 costs about 8% more than v2: the prompt is longer, and the frequencies and the DAPT sentence
add words. The worst case is about 3× English, and Kannada is the longest language in every run.
All six languages for one case average $0.115. Spend so far: v1 $2.04, v2 $1.98, v3 $2.19,
sample runs $0.11. Time per summary averages 5 s in English and 8–14 s in the Indian languages,
16 s at most. The route allows 60 s.

## Native-reader check

The audit checks drugs, doses and numbers. It cannot tell whether the prose is right, kind, or
understood. A reader who speaks the language natively, ideally someone like the patient's family
rather than a clinician, reads each draft and answers five questions **in their own words,
without looking at the record**:

1. **What happened to the patient?** In your own words.
2. **How much of each medicine, and how often?**
3. **Which symptoms need help, and how urgently?**
4. **When and where do they return?**
5. **Which words are confusing?**

The answers are then compared with the record. A wrong or missing answer to questions 1–4 marks
the draft **wrong** on that point; question 5 feeds the prompt or the glossary. Record each draft
as accurate / wrong / unclear, with the reader's notes, in the table below. Cover at least five
cases per language, including PCI-2026-001, a STEMI, a case with a complication (005 or 010) and
a diagnostic-only case (CAG-2026-018).

| Language | Status |
|---|---|
| English | Audit only. Not yet read by a clinician or a patient-side reader. |
| Telugu | **Awaiting native-reader check** (Pavan) |
| Hindi | **Awaiting native-reader check** |
| Tamil | **Awaiting native-reader check** |
| Kannada | **Awaiting native-reader check** |
| Malayalam | **Awaiting native-reader check** |

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
