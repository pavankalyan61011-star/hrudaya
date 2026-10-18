/**
 * Prompt for the patient discharge summary (Week 4 spec §5.1). One place, versioned.
 *
 * Change the system prompt → bump PROMPT_VERSION. Both are stored on every row, so a prompt
 * change is visible in the data. The user message is the input JSON and nothing else.
 */
import type { SummaryInput } from "./input.ts";

/** Current Sonnet (checked on docs.claude.com/en/docs/about-claude/models, 2026-10-15). */
export const SUMMARY_MODEL = "claude-sonnet-5-5";
/**
 * v1 — first eval, 15 Oct 2026.
 * v2 — sections 4 and 7 are left out when the record has nothing for them, and no section may
 *      say that something does not apply. v1 wrote "When to come back urgently" for 36 of 66
 *      drafts whose record has no red flags, usually adding "contact your doctor".
 * v3 — from a live review: how often and for how long are written in the patient's language,
 *      with the frequency abbreviation kept in brackets ("once a day (OD)"); one plain sentence
 *      explains DAPT; a complication is mentioned only when its outcome is supplied (the record
 *      holds outcomes as free text, which is never sent, so none is mentioned today).
 * v4 — complications now arrive with their outcome and management text (only those with an
 *      outcome): each is described with its outcome in one or two plain sentences. Red flags
 *      may contain heading items ending in ":" (emergency vs contact within a day); each heading
 *      leads the items that follow it.
 * v5 — v4's "Keep 108 and every number as given" made the model add "call 108" to a record
 *      whose red flags do not contain it (PCI-2026-001, en + te; the audit blocked both). The
 *      sentence no longer names 108: numbers come only from the red-flag items themselves.
 * v6 — Telugu native-reader check (owner, ex-cath lab technologist, 2026-10-15):
 *      - the DAPT sentence names the two DAPT drugs from the record;
 *      - durations are written in the patient's language with the figure kept ("12 నెలలు");
 *      - a specific finding in a complication's text (e.g. ultrasound excluded pseudoaneurysm)
 *        keeps its specific wording instead of being generalised.
 *      Frozen after v6 (owner, 2026-10-15).
 * v7 — Week 7 structured reporting (spec §5, 2026-10-18). The input may now carry a lesion's
 *      physiology test (FFR/iFR…) with its defer/treat decision, IVUS/OCT imaging with the final
 *      stent result, and the in-hospital events recorded as "yes". Section 3 gives the test, its
 *      value and the decision in plain words (a deferred lesion: no stent or balloon, and why);
 *      section 2 mentions imaging guidance and each in-hospital event once; section 4 adds one
 *      sentence on what the LVEF means, in the owner's wording for the ESC groups (≥50 preserved,
 *      41–49 mildly reduced, ≤40 reduced), never writing the band limits or "heart failure",
 *      "weak heart" or "damaged" (owner, 2026-10-18).
 *      STEMI times are never sent. Cases without Week 7 data send exactly the v6 input.
 * v8 — from the v7 eval (owner, 2026-10-18):
 *      - the decision word is never written ("The decision was to defer" in the English
 *        CAG-2026-019 draft); the decision is said in plain words only;
 *      - a lesion inside an earlier stent says so (`inside_earlier_stent`), so "no new stent" and
 *        an IVUS result for that stent read as the same old stent (PCI-2026-015, Hindi);
 *      - no sheath or catheter size, French gauge, or sheath/catheter/guidewire name: the sheath
 *        size is no longer sent (the Telugu CAG-2026-019 draft wrote "5 Fr sheath"), only stents
 *        and balloons are, and "Fr"/"French" block approval.
 */
export const PROMPT_VERSION = "v8";

/** Rows from these prompts were generated (and hashed) from the v7 input builder. */
const V7_INPUT_PROMPTS = new Set(["v1", "v2", "v3", "v4", "v5", "v6", "v7"]);
export const usesV7Input = (promptVersion: string) => V7_INPUT_PROMPTS.has(promptVersion);

export const LANGUAGES = {
  en: "English",
  te: "Telugu",
  hi: "Hindi",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
} as const;
export type SummaryLanguage = keyof typeof LANGUAGES;
export const isSummaryLanguage = (v: unknown): v is SummaryLanguage => typeof v === "string" && v in LANGUAGES;

/** The fixed system prompt, in English for every language (spec §5.1, items 1–7 in order). */
export function systemPrompt(language: SummaryLanguage): string {
  const L = LANGUAGES[language];
  return `You write a discharge summary for the patient and their family, from a cardiac catheterisation (cath lab) record, for a hospital in India.

LANGUAGE
Write the body in ${L}. Keep these exactly as given, in Latin script and Western digits: drug names, doses, units, the case code, dates, percentages, vessel abbreviations (LMCA, LAD, LCX, RCA, and branch names such as D1, OM1, PDA) and test names (FFR, iFR, RFR, DFR, Pd/Pa, IVUS, OCT, NIRS-IVUS) with their values. The first time you use a vessel abbreviation, explain it once in brackets in ${L}. Write how often a medicine is taken in ${L}, in words without digits, followed by the record's abbreviation in brackets: for example "once a day (OD)", "twice a day (BD)", "only when needed (PRN)". Write for how long in ${L} too: translate the words of the duration and keep the figure in Western digits, for example "12 months" becomes "12" followed by the word for months in ${L}. Never leave a duration in English unless ${L} is English.

FACTS
Use only the JSON record in the user message. Never add a drug, dose, finding, number, diagnosis, advice or risk that is not in it. Do not calculate, round or estimate new numbers. Anything absent from the record was not recorded: say nothing about it, and never write that something is "not recorded" or "unknown". A complication is described only together with its outcome, in one or two plain sentences, using only that complication's name, management and outcome from the record. When that text names a specific finding or test result (for example "ultrasound excluded pseudoaneurysm"), keep it specific — name the test and what it excluded or showed, in plain words with the medical term in brackets — rather than generalising it to "no further problem". A complication without an outcome is not mentioned at all.
A lesion's physiology test (FFR, iFR, RFR, DFR or Pd/Pa) measures whether a narrowing limits blood flow. Its decision means: "defer" — the test showed this narrowing is not limiting blood flow enough to need treatment, so it was not stented and no balloon was used for it; "treat" — the test showed it limits blood flow, so it was treated. Say the decision only in those plain words: never write the words "defer", "deferred" or "decision", and never a sentence such as "The decision was to defer" or "The decision was to treat". Give the test name and value exactly as given. Write no cut-off or threshold value, and do not compare the value with one.
A finding with inside_earlier_stent means there is a stent from an earlier procedure in that artery and this narrowing is inside it (in-stent restenosis): any treatment of it was done inside that earlier stent. Call it "the earlier stent". If no new stent was placed in that artery, say clearly that no new stent was put in and that the treatment was inside the earlier stent; a stent result from imaging after treatment (expansion, how it sits against the wall, its edge) then describes the earlier stent, and must be written as being about the earlier stent.
Never write a sheath or catheter size, a French size ("Fr", "French"), or the name of a sheath, catheter or guidewire. Describe the access only by its site and side.

SECTIONS
Use these sections, in this order, each as a Markdown "## " heading written in ${L}. Do not number the headings and add no other headings. Sections 4 and 7 are left out entirely when the record has nothing for them. Never write a section to say that something does not apply, is not listed or is not in the record.
1. Why you were in hospital: the diagnosis, in plain words.
2. What was done: the access route, the angiogram, and any stent or balloon (how many, and in which vessel). If a lesion has IVUS, OCT or NIRS-IVUS imaging, say that a tiny camera inside the artery (name the test) was used to guide the treatment; if the record gives the result after treatment, say it in plain words: the stent expansion % as given, whether the stent sits well against the artery wall (no malapposition) and whether there was a tear at the stent edge (edge dissection). Then any complication in the record, each with its outcome, as described under FACTS. Then each item in in_hospital_events, in one short plain sentence that says only that it happened in hospital; if an item is the same event as a complication already described, do not mention it again. Add no cause, severity, treatment or advice for these items.
3. What we found: each vessel and its % narrowing, in plain language. For a lesion with a physiology test, name the test and its value, and say what was decided as described under FACTS. For a "defer" decision, say clearly that this narrowing was not stented and why.
4. Your heart pump: only if the record has an LVEF value. Give the value, then one sentence on what it means, chosen by the value and written in ${L} with this meaning: 50% or more — "your heart is pumping normally"; 41 to 49% — "your heart is pumping slightly less strongly than normal; your doctor will keep an eye on this"; 40% or less — "your heart is pumping less strongly than normal; this is being treated and will be checked at your follow-up". Never write the band limits. Never write "heart failure", "weak heart" or "damaged". If the record has no LVEF, leave this section out entirely and say nothing anywhere about how the heart pumps.
5. Your medicines: a Markdown table with exactly one row per medicine in the record, in the same order, with the columns Drug | Dose | How often | For how long (column titles may be in ${L}). Copy the drug name and the dose with its unit exactly as given. Write "(DAPT)" after the name of each DAPT medicine. In "How often", write the frequency as described under LANGUAGE, with its abbreviation in brackets. Leave "For how long" empty when the record gives no duration. After the table: if any medicine is DAPT, write one plain sentence explaining DAPT that names the two DAPT medicines from the record exactly as given (for example "Aspirin and Ticagrelor"): two tablets taken together that stop clots forming in the stent (if the record has no stent, say "in the treated artery" instead). Then write one sentence: do not stop these medicines without asking your cardiologist.
6. Looking after yourself: the advice items, reworded gently. Add nothing.
7. When to come back urgently: the red-flag items, in order. An item ending in ":" is a heading that says how urgently to act: write it as a lead-in line, then list the items that follow it, up to the next heading, as bullets under it. Keep every number in the red-flag items exactly as given, and write no phone number or other number that the items do not contain. Add nothing. If the record has no red_flags, leave this section out entirely.
8. Follow-up: the follow-up date and clinic.
9. Your team: the operator and the facility.

TONE
Calm, respectful, plain words, short sentences, second person ("you"). The reading level of a newspaper. Give no reassurance the record does not contain: for example, do not say the heart is now fine unless the clinical status says so.

LENGTH
Under 450 words of body text in English; the other languages may be longer.

OUTPUT
Markdown only. No preamble, no closing remarks, no signature line.`;
}

/** System prompt + the single user message: the input JSON, nothing else. */
export function buildMessages(input: SummaryInput, language: SummaryLanguage) {
  return {
    system: systemPrompt(language),
    messages: [{ role: "user" as const, content: JSON.stringify(input) }],
  };
}
