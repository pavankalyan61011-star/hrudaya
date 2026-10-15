/**
 * auditDraft against hand-written drafts (Week 4 spec §9): a clean draft, a missing drug, an extra
 * drug, an invented number and a dose mismatch, in English and Telugu; script_check for all five
 * Indian scripts. Synthetic fixture only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fhir/test-fixture.ts";
import { buildSummaryInput } from "./input.ts";
import { auditDraft, hasErrors, type AuditFlag } from "./audit.ts";

const input = buildSummaryInput(fixture());
const codes = (flags: AuditFlag[]) => flags.map((f) => f.code).sort();

const EN = `## Why you were in hospital
You had a heart attack (STEMI).

## What was done
Through the right wrist artery we took pictures of your heart arteries and placed one stent in the LAD (the main artery at the front of the heart).

## What we found
The LAD was 100% blocked. The LMCA had 0% narrowing.

## Your heart pump
Your heart pump strength (LVEF) is 45%.

## Your medicines
| Drug | Dose | How often | For how long |
|---|---|---|---|
| Aspirin (DAPT) | 75 mg | OD | |
| Ticagrelor (DAPT) | 90 mg | BD | 12 months |
| Atorvastatin | 80 mg | OD | |
| GTN | | PRN | |

Do not stop these medicines without asking your cardiologist.

## Looking after yourself
Take your DAPT medicines every day. Please stop smoking.

## When to come back urgently
Come back at once if chest pain returns or you have heavy bleeding.

## Follow-up
Cardiology OPD on 2026-10-15.

## Your team
Dr Test Operator, Synthetic Test Hospital.
`;

const TE = `## మీరు ఆసుపత్రిలో ఎందుకు ఉన్నారు
మీకు గుండెపోటు (STEMI) వచ్చింది.

## ఏమి చేశారు
కుడి మణికట్టు ధమని ద్వారా మీ గుండె రక్తనాళాల చిత్రాలు తీసి, LAD (గుండె ముందు భాగంలోని ప్రధాన రక్తనాళం) లో ఒక స్టెంట్ వేశారు.

## మేము ఏమి కనుగొన్నాము
LAD 100% మూసుకుపోయింది. LMCA లో 0% సంకోచం ఉంది.

## మీ గుండె పంపు
మీ గుండె పంపు శక్తి (LVEF) 45%.

## మీ మందులు
| మందు | మోతాదు | ఎంత తరచుగా | ఎంత కాలం |
|---|---|---|---|
| Aspirin (DAPT) | 75 mg | OD | |
| Ticagrelor (DAPT) | 90 mg | BD | 12 months |
| Atorvastatin | 80 mg | OD | |
| GTN | | PRN | |

మీ కార్డియాలజిస్ట్‌ను అడగకుండా ఈ మందులను ఆపవద్దు.

## మిమ్మల్ని మీరు చూసుకోవడం
DAPT మందులను ప్రతిరోజూ తీసుకోండి. దయచేసి పొగ తాగడం మానేయండి.

## వెంటనే తిరిగి రావలసినప్పుడు
ఛాతీ నొప్పి మళ్ళీ వస్తే లేదా ఎక్కువ రక్తస్రావం అయితే వెంటనే రండి.

## తదుపరి సందర్శన
Cardiology OPD, 2026-10-15 న.

## మీ బృందం
Dr Test Operator, Synthetic Test Hospital.
`;

// ─── Clean ────────────────────────────────────────────────────────────────────

test("a clean English draft has no flags", () => {
  assert.deepEqual(auditDraft(input, EN, "en"), []);
});

test("a clean Telugu draft has no flags", () => {
  assert.deepEqual(auditDraft(input, TE, "te"), []);
});

// ─── The four error rules, English and Telugu ────────────────────────────────

for (const [lang, draft] of [["en", EN], ["te", TE]] as const) {
  test(`${lang}: a missing drug is an error`, () => {
    const flags = auditDraft(input, draft.replace("| Atorvastatin | 80 mg | OD | |\n", ""), lang);
    assert.deepEqual(codes(flags), ["drug_missing"]);
    assert.match(flags[0].detail, /Atorvastatin/);
    assert.equal(hasErrors(flags), true);
  });

  test(`${lang}: an extra drug is an error`, () => {
    const flags = auditDraft(input, draft.replace("| GTN | | PRN | |", "| GTN | | PRN | |\n| Clopidogrel | | OD | |"), lang);
    assert.deepEqual(codes(flags), ["drug_extra"]);
    assert.match(flags[0].detail, /clopidogrel/);
  });

  test(`${lang}: an invented number is an error`, () => {
    const flags = auditDraft(input, draft.replace("45%", "55%"), lang);
    assert.deepEqual(codes(flags), ["number_unknown"]);
    assert.match(flags[0].detail, /^55 /);
  });

  test(`${lang}: a dose mismatch is an error (and the wrong dose is also an unknown number)`, () => {
    const flags = auditDraft(input, draft.replace("| 90 mg |", "| 95 mg |"), lang);
    assert.deepEqual(codes(flags), ["dose_mismatch", "number_unknown"]);
    assert.match(flags.find((f) => f.code === "dose_mismatch")!.detail, /Ticagrelor is not followed by 90 mg/);
  });
}

test("a dose that exists elsewhere in the record still mismatches its own drug", () => {
  // 80 is a real number in the input (Atorvastatin), so only dose_mismatch can catch it on Aspirin.
  const flags = auditDraft(input, EN.replace("| 75 mg |", "| 80 mg |"), "en");
  assert.deepEqual(codes(flags), ["dose_mismatch"]);
  assert.match(flags[0].detail, /Aspirin/);
});

test("a dose of 175 mg does not satisfy 75 mg", () => {
  const flags = auditDraft(input, EN.replace("| 75 mg |", "| 175 mg |"), "en");
  assert.ok(codes(flags).includes("dose_mismatch"));
});

test("a drug named in prose more than 60 characters before its dose mismatches", () => {
  const prose = EN.replace("| Aspirin (DAPT) | 75 mg | OD | |\n", "").replace(
    "Do not stop",
    "Aspirin (DAPT) is a blood thinner that keeps the new stent open and clear of clots: 75 mg OD.\n\nDo not stop",
  );
  assert.deepEqual(codes(auditDraft(input, prose, "en")), ["dose_mismatch"]);
});

test("heading numbers are structure, not invented numbers", () => {
  let n = 0;
  const numbered = EN.replace(/^## /gm, () => `## ${++n}. `);
  assert.deepEqual(auditDraft(input, numbered, "en"), []);
});

test("digits in an Indian script are flagged — the prompt requires Western digits", () => {
  const flags = auditDraft(input, TE.replace("LVEF) 45%", "LVEF) ౪౫%"), "te");
  assert.deepEqual(codes(flags), ["number_unknown"]);
});

test("dates in the record are known numbers", () => {
  assert.deepEqual(auditDraft(input, EN.replace("2026-10-15", "15 October 2026"), "en"), []);
});

// ─── Warnings ─────────────────────────────────────────────────────────────────

test("section count: 9 with LVEF, 8 without", () => {
  const noPump = EN.replace(/## Your heart pump\n.*\n\n/, "");
  assert.deepEqual(codes(auditDraft(input, noPump, "en")), ["section_missing"]);

  const noLvef = buildSummaryInput(fixture({ lvef_status: "not_performed", lvef_pct: null }));
  assert.deepEqual(codes(auditDraft(noLvef, noPump, "en")), []);
  assert.deepEqual(codes(auditDraft(noLvef, EN.replace("45%", "good"), "en")), ["section_extra"]);

  assert.deepEqual(codes(auditDraft(input, EN + "\n## Notes\nNothing else.\n", "en")), ["section_extra"]);
  assert.equal(hasErrors(auditDraft(input, noPump, "en")), false);
});

test("forbidden phrases are warnings", () => {
  const flags = auditDraft(input, EN.replace("Please stop smoking.", "Please stop smoking. Weight: not recorded. Height N/A."), "en");
  assert.deepEqual(codes(flags), ["forbidden_phrase", "forbidden_phrase"]);
  assert.equal(hasErrors(flags), false);
});

test("over 700 words is a warning", () => {
  const long = EN.replace("Please stop smoking.", "Please stop smoking. " + "Walk gently every day. ".repeat(160));
  assert.deepEqual(codes(auditDraft(input, long, "en")), ["too_long"]);
});

// ─── script_check: all five Indian scripts ───────────────────────────────────

/** A minimal body in each script, with drug names and the table in Latin as the prompt asks. */
const SCRIPT_SAMPLES = {
  te: "మీకు గుండెపోటు వచ్చింది. మందులను ప్రతిరోజూ తీసుకోండి.",
  hi: "आपको दिल का दौरा पड़ा था। दवाइयाँ रोज़ लें।",
  ta: "உங்களுக்கு மாரடைப்பு ஏற்பட்டது. மருந்துகளை தினமும் எடுத்துக் கொள்ளுங்கள்.",
  kn: "ನಿಮಗೆ ಹೃದಯಾಘಾತವಾಗಿತ್ತು. ಔಷಧಿಗಳನ್ನು ಪ್ರತಿದಿನ ತೆಗೆದುಕೊಳ್ಳಿ.",
  ml: "നിങ്ങൾക്ക് ഹൃദയാഘാതം ഉണ്ടായി. മരുന്നുകൾ ദിവസവും കഴിക്കുക.",
} as const;

const scriptFlags = (lang: keyof typeof SCRIPT_SAMPLES | "en", body: string) =>
  auditDraft(input, body, lang).filter((f) => f.code === "script_check");

for (const lang of Object.keys(SCRIPT_SAMPLES) as (keyof typeof SCRIPT_SAMPLES)[]) {
  test(`script_check ${lang}: its own script passes, with Latin drug names and table ignored`, () => {
    const body = `${SCRIPT_SAMPLES[lang]} Aspirin, Ticagrelor (DAPT), LAD, 75 mg OD.\n| Drug | Dose |\n|---|---|\n| Aspirin | 75 mg |`;
    assert.deepEqual(scriptFlags(lang, body), []);
  });

  test(`script_check ${lang}: English text fails`, () => {
    const flags = scriptFlags(lang, "You had a heart attack. Take your medicines every day.");
    assert.equal(flags.length, 1);
    assert.match(flags[0].detail, /^0% /);
    assert.equal(flags[0].severity, "warning");
  });

  test(`script_check ${lang}: a different Indian script fails`, () => {
    const other = (Object.keys(SCRIPT_SAMPLES) as (keyof typeof SCRIPT_SAMPLES)[]).find((l) => l !== lang)!;
    assert.equal(scriptFlags(lang, SCRIPT_SAMPLES[other]).length, 1);
  });
}

test("script_check: mostly the right script passes; under 70% fails", () => {
  const te = SCRIPT_SAMPLES.te; // Telugu letters
  const hi = SCRIPT_SAMPLES.hi;
  assert.deepEqual(scriptFlags("te", `${te} ${te} ${te} ${hi}`), []);
  assert.equal(scriptFlags("te", `${te} ${hi} ${hi}`).length, 1);
});

test("script_check does not run for English", () => {
  assert.deepEqual(scriptFlags("en", "మీకు గుండెపోటు వచ్చింది."), []);
});
