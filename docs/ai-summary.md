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
   advice, red flags and medicines. It contains no name, date of birth, MRN, ABHA, phone, device
   lot, expiry or UDI. There is one exception to "no free text" (owner, 2026-10-15): a
   complication's management and outcome text, at most 300 characters each, and only for a
   complication that has an outcome. One without an outcome is left out of the input entirely. Null fields are left out, never sent as "Not recorded". The
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
| System prompt + one user message (the input JSON) | `lib/summary/prompt.ts` (`PROMPT_VERSION = "v6"`) |
| Claude API call, server-only | `lib/summary/generate.ts` |
| Audit | `lib/summary/audit.ts`, `lib/summary/drug-list.ts` |
| Generate / approve | `POST /api/procedures/[id]/summary`, `PUT …/summary/[summaryId]` (`lib/summary/api.ts`) |
| Card on the report page | `components/report/discharge-summary.tsx` |
| Print (A4, approved only) | `/procedures/[id]/print`. Each summary ends with "Approved by Dr X on … · version N. Drafted with AI assistance (prompt vN); checked and approved by the clinician named." No vendor or model name is shown to patients or clinicians (owner, 2026-10-15). The model is kept on the row for provenance. |
| Storage | `discharge_summaries` (migration 0008): one row per procedure × language × version |

Request settings: model `claude-sonnet-5-5` (stored per row as the model that answered),
`max_tokens` 6000, `thinking: {type: "between_tools"}` (no extended thinking), server-side
refusal fallback on, no temperature. A draft that comes back cut off at `max_tokens`, refused or
empty is **not stored**. Each user may generate 20 summaries a day (counted from midnight IST).
Logs carry ids, language, version, tokens, latency and flag codes. They never carry the input or
the draft.

`ANTHROPIC_API_KEY` is read on the server only and is never `NEXT_PUBLIC_`. Without it, the app
builds and runs, and the Generate button is disabled with "AI summary not configured on this
server".

## The prompt (v6, frozen)

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
- **v4:**
  - complications now arrive with their outcome and management text, and each is described
    together with its outcome;
  - red flags may contain urgency headings (items ending in ":"), and each heading leads the
    items after it.

- **v5:** the red-flag sentence no longer names "108". Numbers in that section come only from the
  record's own red-flag items.
- **v6**, from the Telugu native-reader check:
  - the DAPT sentence names the two DAPT medicines from the record;
  - durations are written in the patient's language with the figure kept ("12 నెలలు");
  - a specific finding in a complication's text (e.g. "ultrasound excluded pseudoaneurysm") keeps
    its specific wording.

**The prompt is frozen at v6** (owner, 15 Oct 2026). The next change comes from the remaining
native readers (Hindi, Tamil, Kannada, Malayalam). v6 eval: 114/114, 0 flags; every read-through point fixed (see
[Eval](#eval)).

Each change and its effect is under [Eval](#eval).

```text
You write a discharge summary for the patient and their family, from a cardiac catheterisation (cath lab) record, for a hospital in India.

LANGUAGE
Write the body in {LANGUAGE}. Keep these exactly as given, in Latin script and Western digits: drug names, doses, units, the case code, dates, percentages and vessel abbreviations (LMCA, LAD, LCX, RCA, and branch names such as D1, OM1, PDA). The first time you use a vessel abbreviation, explain it once in brackets in {LANGUAGE}. Write how often a medicine is taken in {LANGUAGE}, in words without digits, followed by the record's abbreviation in brackets: for example "once a day (OD)", "twice a day (BD)", "only when needed (PRN)". Write for how long in {LANGUAGE} too: translate the words of the duration and keep the figure in Western digits, for example "12 months" becomes "12" followed by the word for months in {LANGUAGE}. Never leave a duration in English unless {LANGUAGE} is English.

FACTS
Use only the JSON record in the user message. Never add a drug, dose, finding, number, diagnosis, advice or risk that is not in it. Do not calculate, round or estimate new numbers. Anything absent from the record was not recorded: say nothing about it, and never write that something is "not recorded" or "unknown". A complication is described only together with its outcome, in one or two plain sentences, using only that complication's name, management and outcome from the record. When that text names a specific finding or test result (for example "ultrasound excluded pseudoaneurysm"), keep it specific — name the test and what it excluded or showed, in plain words with the medical term in brackets — rather than generalising it to "no further problem". A complication without an outcome is not mentioned at all.

SECTIONS
Use these sections, in this order, each as a Markdown "## " heading written in {LANGUAGE}. Do not number the headings and add no other headings. Sections 4 and 7 are left out entirely when the record has nothing for them. Never write a section to say that something does not apply, is not listed or is not in the record.
1. Why you were in hospital: the diagnosis, in plain words.
2. What was done: the access route, the angiogram, and any stent or balloon (how many, and in which vessel). Then any complication in the record, each with its outcome, as described under FACTS.
3. What we found: each vessel and its % narrowing, in plain language.
4. Your heart pump: only if the record has an LVEF value. If it has none, leave this section out entirely.
5. Your medicines: a Markdown table with exactly one row per medicine in the record, in the same order, with the columns Drug | Dose | How often | For how long (column titles may be in {LANGUAGE}). Copy the drug name and the dose with its unit exactly as given. Write "(DAPT)" after the name of each DAPT medicine. In "How often", write the frequency as described under LANGUAGE, with its abbreviation in brackets. Leave "For how long" empty when the record gives no duration. After the table: if any medicine is DAPT, write one plain sentence explaining DAPT that names the two DAPT medicines from the record exactly as given (for example "Aspirin and Ticagrelor"): two tablets taken together that stop clots forming in the stent (if the record has no stent, say "in the treated artery" instead). Then write one sentence: do not stop these medicines without asking your cardiologist.
6. Looking after yourself: the advice items, reworded gently. Add nothing.
7. When to come back urgently: the red-flag items, in order. An item ending in ":" is a heading that says how urgently to act: write it as a lead-in line, then list the items that follow it, up to the next heading, as bullets under it. Keep every number in the red-flag items exactly as given, and write no phone number or other number that the items do not contain. Add nothing. If the record has no red_flags, leave this section out entirely.
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
drafts, no model call). Each run: every seeded discharged case × six languages (19 × 6 = 114).
`max_tokens` was 3000 for v1–v3, 4000 for v4 and 6000 for v5. Only `claude-sonnet-5-5` answered
in every run; the fallback never ran. v4 and v5 ran on corrected data: standard red flags for 11 discharges, and
PCI-2026-005's timeline (`docs/backlog.md` → Data corrections).

### v6: what the Telugu read-through changed

The first v6 run was blocked by the API credit balance (0 generated, 0 billed). After credit was
added, a single test call passed, then the full run: **114/114 generated, 0 error flags, 0
warnings, $2.73.** The v6 checks, with v5 as the baseline:

| v6 check | v5 | v6 |
|---|---|---|
| DAPT drafts whose prose names both DAPT medicines, any language (of 102) | 1 | **102** |
| Indian-language drafts with a duration still in English "month(s)" (of 80) | 58 | **0** |
| PCI-2026-005 English names the ultrasound finding (pseudoaneurysm) | no | **yes** |
| …Indian-language 005 drafts keeping the term "pseudoaneurysm" (of 5) | 0 | 4 |
| The 11 corrected cases, English: GI-bleeding item in the emergency group (of 11) | 0 (before the data correction) | **11** |

In Telugu, PCI-2026-008's duration is "12 నెలలు", and PCI-2026-001's DAPT sentence reads
"Aspirin మరియు Ticagrelor అనే రెండు మాత్రలను…". These are the two points from the read-through.

### Before and after: prompt v1 → v6 (15 Oct 2026)

| | v1 | v2 | v3 | v4 | v5 | v6 |
|---|---|---|---|---|---|---|
| Generated / failed or cut off | 114 / 0 | 114 / 0 | 114 / 0 | 114 / 0 | 114 / 0 | 114 / 0 |
| **Error flags** (drug missing/extra, unknown number, dose mismatch) | **0** | **0** | **0** | **2** (`number_unknown`: an invented "108") | **0** | **0** |
| **Audit warnings** | **37** | **0** | **0** | **0** | **0** | **0** |
| A section written for an empty part of the record | 37 | 0 | 0 | 0 | 0 | 0 |
| Frequency with its abbreviation in brackets, e.g. "రోజుకు ఒకసారి (OD)" (of 210 medicine-frequency pairs) | 0 | 0 | 210 | 210 | 210 | 210 |
| English drafts with the DAPT sentence (of 17) | 0 | 0 | 17 | 17 | 17 | 17 |
| Complication described **with its outcome**, English (of 2) | 0 | 0 | 0 (none mentioned) | **2** | **2** | **2** |
| Complication mentioned **without** an outcome, Indian languages (of 10) | ≥ 8 | ≥ 8 | ≥ 5 | — (v4 sends the outcome; whether each draft states it awaits the native-reader check) | — (as v4) | — (as v4) |
| The 11 corrected cases: drafts with "108" (of 66) | 0 | 0 | 0 | **66** | **66** | **66** |
| …English drafts with both urgency groups in order and all 9 items (of 11) | 0 | 0 | 0 | **11** | **11** | **11** |
| "108" written where the record's red flags do not contain it (of 48) | 0 | 0 | 0 | **2** | **0** | **0** |
| Longest draft, tokens out (limit) | 2,657 (3,000) | 2,557 (3,000) | 2,938 (3,000) | 3,902 (4,000) | **4,006 (6,000)** | **3,993 (6,000)** |
| Cost of the run | $2.04 | $1.98 | $2.19 | $2.66 | $2.69 | $2.73 |

**Audit flags by language:**

| Prompt | en | te | hi | ta | kn | ml | Total |
|---|---|---|---|---|---|---|---|
| v1 (warnings: `section_extra`) | 4 | 6 | 4 | 10 | 6 | 7 | 37 |
| v2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| v3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| v4 (errors: `number_unknown`) | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| v5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| v6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The audit blocked two drafts where v4's own prompt wording had caused the model to add "call 108" to a case whose record did not contain it — the layered guards caught a prompt error, not a model error.

**v1 → v2.** For a record with no red flags, v1 sometimes wrote "When to come back urgently"
anyway, adding a general "contact your doctor" that is not in the record. Once (PCI-2026-017) it
wrote "Your heart pump" to say there was no LVEF. v2 leaves empty sections out.

**v2 → v3** (live review):
- frequency and duration are in the patient's language, with the abbreviation kept;
- a DAPT sentence was added ("in the treated artery" for PCI-2026-015, which has no stent);
- complications are left out unless their outcome is supplied. English complied; the Indian
  languages did not reliably (at least 5 of 10 still named the complication), which is why v4
  changed the input rather than relying on the prompt.

**v3 → v4.**
- **Complications.** The input now carries each complication's outcome and management text, and
  leaves out any complication without an outcome. Both English drafts describe the complication
  together with its outcome:
  - PCI-2026-005: "…a 3-cm swelling (haematoma) appeared in your groin after the sheath was
    removed … The swelling went away with pressure alone";
  - PCI-2026-010: "…blood flow slowed after the stent was placed (no-reflow) … normal flow (TIMI
    III) was restored".

  005 runs to four sentences against the prompt's "one or two". All 10 Indian-language drafts name
  the complication. Whether they state the outcome correctly is a native-reader question.
- **Red flags.** Every draft for the 11 corrected cases includes 108. All 11 English drafts keep
  the emergency group (with 108) before the "within a day" group, with all 9 items.
- **Two error flags, caught by the audit as designed.** The audit blocked two drafts where v4's own prompt wording had caused the model to add "call 108" to a case whose record did not contain it — the layered guards caught a prompt error, not a model error. In detail: PCI-2026-001 keeps its original red flags,
  which have no 108, yet its English and Telugu drafts added "call 108". The cause is v4's own
  wording, "Keep 108 and every number as given", which primed the model. None of the other 46
  drafts whose record has its own red flags did this. A number is caught in every language, so
  nothing slipped through, and both drafts are blocked from approval until edited. **Fix
  (v5):** drop "108" from that sentence and keep "every number as
  given". Applied in v5, below.
- **Headroom, again.** The new red flags make Kannada much longer: 10 of the 19 Kannada drafts are
  over 3,000 tokens and 9 are over 3,500, the longest at 3,902 of the 4,000 limit. Malayalam,
  Tamil and Telugu stay under 2,900. A cut-off draft is refused, never stored, but at 4,000 a
  slightly longer Kannada record would fail to generate. Raised to 6,000 in v5.

**v4 → v5.**
- **108:** the red-flag sentence no longer names 108. No draft writes 108 where the record's red
  flags lack it (0 of 48; v4 had 2). All 66 drafts for the corrected cases still include it, from
  the record. Audit: 0 errors and 0 warnings across all 114.
- **Headroom:** one Kannada draft (PCI-2026-009) used 4,006 tokens. It would have been refused at
  the old limit of 4,000; at 6,000 it completed. Eight Kannada drafts are over 3,500; every other
  language stays under 2,800.
- **Everything else held:** 210/210 frequencies with the abbreviation, 17/17 DAPT sentences, both
  English complications described with their outcome ("The swelling settled with pressure";
  "Normal blood flow came back"), and the urgency groups in order in all 11 English drafts.
- **The prompt was frozen at v5**, pending native-reader feedback. The Telugu read-through then
  led to v6, which is now the frozen version.

**How the counts were checked.** The audit runs on every draft. Separately, scripts read every
saved draft from all four runs:
- sections the record leaves empty;
- each medicine frequency's `(OD)`/`(BD)`/`(PRN)` in brackets;
- the English DAPT sentence;
- complication terms and outcome words;
- 108 in the corrected cases, and the order of the urgency groups;
- 108 where the record has none.

Every check was run on an older version as a control. The v3 control exposed one check that
matched too broadly ("blood flow" alone); it was tightened before the v4 numbers were taken. In
v5 the outcome check was too narrow ("resolved" only, while the drafts said "settled" and "came
back"). Reading both drafts confirmed them, and the check now accepts those words; re-run across
v2–v5, it gives false/false/true/true.
Checks on text in the Indian scripts are limited to Latin tokens (terms, abbreviations, numbers).
The prose itself awaits the native-reader check.

## Cost per summary

**Prompt v6 (frozen), the current figures:**

| | Tokens in / out (v6) | Cost per summary, v6 |
|---|---|---|
| **English**, average of 19 | 2,457 / 868 | **$0.0136** (range $0.0115–$0.0155) |
| **Longest Indian-language case** (PCI-2026-012, Kannada) | 2,634 / 3,993 | **$0.0452** |
| Telugu, average | 2,481 / 1,765 | $0.0226 |
| Hindi, average | 2,481 / 1,408 | $0.0191 |
| Tamil, average | 2,481 / 1,916 | $0.0241 |
| Kannada, average | 2,481 / 3,152 | $0.0365 |
| Malayalam, average | 2,489 / 2,289 | $0.0279 |

All six languages for one case average $0.144. Five Kannada drafts are over 3,500 tokens; the limit
is 6,000. Time averages 6 s in English and 10–18 s in the Indian languages, 22 s at most. The
whole v6 run cost $2.73. Total API spend across all runs is about $14.41.

Earlier versions, for comparison:

Price for `claude-sonnet-5-5`: $2 per million input tokens, $10 per million output
(platform.claude.com, 15 Oct 2026). Input is about 2,300 tokens in every language under v5: the
prompt and the record JSON. Output is what differs, because Indian scripts take several times more
tokens per word than English, and the standard red flags add the most in Kannada. Prompt v5
figures (v5; v6 below), with earlier versions for comparison:

| | Tokens in / out (v5) | Cost per summary, v5 | v4 | v3 | v2 | v1 |
|---|---|---|---|---|---|---|
| **English**, average of 19 | 2,290 / 842 | **$0.0130** (range $0.0109–$0.0153) | $0.0129 | $0.0113 | $0.0105 | $0.0105 |
| **Longest Indian-language case** (v5: PCI-2026-009, Kannada) | 2,467 / 4,006 | **$0.0450** | $0.0438 | $0.0336 | $0.0294 | $0.0303 |
| Telugu, average | 2,308 / 1,760 | $0.0222 | $0.0221 | $0.0185 | $0.0169 | $0.0171 |
| Hindi, average | 2,308 / 1,380 | $0.0184 | $0.0185 | $0.0151 | $0.0143 | $0.0149 |
| Tamil, average | 2,308 / 1,952 | $0.0241 | $0.0237 | $0.0197 | $0.0173 | $0.0182 |
| Kannada, average | 2,308 / 3,207 | $0.0367 | $0.0362 | $0.0293 | $0.0256 | $0.0263 |
| Malayalam, average | 2,314 / 2,226 | $0.0269 | $0.0265 | $0.0211 | $0.0197 | $0.0202 |

The worst case is about 3.5× English. All six languages for one case average $0.141. Spend so
far: v1 $2.04, v2 $1.98, v3 $2.19, v4 $2.66, v5 $2.69, sample runs $0.11, about $11.67 in all.
Time per summary averages 6 s in English and 10–18 s in the Indian languages, 25 s at most. The
route allows 60 s.

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
| Telugu | **Native-reader checked** (15 Oct 2026; see below) |
| Hindi | **Awaiting native-reader check** |
| Tamil | **Awaiting native-reader check** |
| Kannada | **Awaiting native-reader check** |
| Malayalam | **Awaiting native-reader check** |

## Clinical read-through — Telugu (native speaker, ex-cath lab technologist, 15 Oct 2026)

Read by the owner, a native Telugu speaker and former cath-lab technologist, on the v5 Telugu
drafts:

| Case | Verdict | Note | What changed |
|---|---|---|---|
| PCI-2026-001 | **Accurate** | DAPT drugs should be named | Prompt v6: the DAPT sentence names both medicines from the record |
| PCI-2026-005 | **Accurate** | Outcome stated; the ultrasound wording should be specific | Prompt v6: a specific finding ("ultrasound excluded pseudoaneurysm") keeps its wording |
| PCI-2026-010 | **Accurate** | Outcome stated | — |
| CAG-2026-018 | **Accurate** | The source red-flag grouping was wrong | Data correction: GI bleeding moved to the emergency group in all 11 standard lists (`docs/backlog.md` → Data corrections) |
| PCI-2026-008 | **Accurate** | The duration should be translated | Prompt v6: durations in the patient's language with the figure kept ("12 నెలలు") |

All five were accurate. Every note was about clarity or completeness, not about a wrong fact. One
note (018) was about the record itself, not the draft. The v5 checks show each note was a pattern,
not a one-off: only 1 of 102 DAPT drafts named both drugs, and 58 of 80 Indian-language drafts left
"months" in English. Whether v6 fixes these awaits its eval run.

## Decisions that differ from the spec

- **No `temperature`.** The spec asked for 0. `claude-sonnet-5-5` rejects any non-default sampling
  value with a 400. Temperature 0 never guaranteed identical output anyway; the audit is what holds
  a draft to the record.
- **`max_tokens` 6000, not 1500** (owner, 2026-10-15). In the first six-call sample, Kannada and
  Malayalam were cut off at 1500, so it went to 3000. The v3 longest Kannada draft used 2,938 of
  3,000, so it went to 4000. Under v4 (longer red flags), 10 of the 19 Kannada drafts would have
  been cut off at 3000, and the longest used 3,902 of 4,000, so it went to 6000. In v5, one Kannada
  draft used 4,006, which would have been refused at 4000. These scripts take about 5.5 tokens a word. The limit is
  a ceiling: English still uses about 850.
- **Thinking off** (`between_tools`). Sonnet 5.5 thinks by default, and the thinking would come out
  of the same token budget. This task is transcription from a small JSON record.
- **Server-side refusal fallback** (`fallbacks: "default"`). If it ever runs, the model that wrote
  the draft is the one stored on the row.
- **`procedure_events.payload`** (jsonb, nullable) was added in 0008, because the table had no
  column for the spec's `{language, version}`.
- **Save edit without approving** (`approve: false`) keeps the clinician's text on a draft.
