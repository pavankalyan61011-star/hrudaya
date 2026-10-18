/**
 * Week 5 spec §6, §8: flags beside sections. Real `auditDraft` output on drafts parsed with
 * `parseDraft`, then placed with `locateFlags`. Synthetic fixture and committed eval drafts only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auditDraft } from "./audit.ts";
import { buildSummaryInput } from "./input.ts";
import { parseDraft, presenceFromInput, type Presence } from "./sections.ts";
import { locateFlags, type UiFlag } from "./flag-locations.ts";
import { fixture } from "../fhir/test-fixture.ts";

const input = buildSummaryInput(fixture());
const presence = presenceFromInput(input);

const CLEAN = `## Why you were in hospital
You had a heart attack (STEMI).

## What was done
Through the right wrist artery we placed one stent in the LAD (the main artery at the front of the heart).

## What we found
The LAD was 100% blocked. The LMCA had 0% narrowing.

## Your heart pump
Your heart pump strength (LVEF) is 45%.

## Your medicines
| Drug | Dose | How often | For how long |
|---|---|---|---|
| Aspirin (DAPT) | 75 mg | once a day (OD) | |
| Ticagrelor (DAPT) | 90 mg | twice a day (BD) | 12 months |
| Atorvastatin | 80 mg | once a day (OD) | |
| GTN | | only when needed (PRN) | |

DAPT means Aspirin and Ticagrelor taken together. Do not stop these medicines without asking your cardiologist.

## Looking after yourself
Take your DAPT medicines every day. Please stop smoking.

## When to come back urgently
Come back at once if chest pain returns or you have heavy bleeding.

## Follow-up
Cardiology OPD on 2026-10-15.

## Your team
Dr Test Operator, Synthetic Test Hospital.
`;

function place(draft: string, p: Presence = presence) {
  const flags = auditDraft(input, draft, "en") as UiFlag[];
  const at = locateFlags(parseDraft(draft, p), flags);
  const where = (code: string) => [...at.entries()].filter(([, fs]) => fs.some((f) => f.code === code)).map(([k]) => k);
  return { flags, at, where };
}

test("control: the clean draft parses structured and has no flags", () => {
  assert.equal(parseDraft(CLEAN, presence).fallback, false);
  assert.equal(place(CLEAN).flags.length, 0);
});

test("a dose error lands on medicines (dose_mismatch, and its unknown number too)", () => {
  const { where } = place(CLEAN.replace("| 90 mg |", "| 95 mg |"));
  assert.deepEqual(where("dose_mismatch"), ["medicines"]);
  assert.deepEqual(where("number_unknown"), ["medicines"]);
});

test("an invented number in the findings lands on found", () => {
  const { where } = place(CLEAN.replace("The LAD was 100% blocked.", "The LAD was 97% blocked."));
  assert.deepEqual(where("number_unknown"), ["found"]);
});

test("section_extra stays global — from a real extra heading, and on a structured draft", () => {
  const extra = place(CLEAN + "\n## Notes\nNothing else.\n");
  assert.deepEqual(extra.where("section_extra"), ["global"]);
  const structured = locateFlags(parseDraft(CLEAN, presence), [{ code: "section_extra", severity: "warning", detail: "10 sections, expected 9" }]);
  assert.deepEqual([...structured.keys()], ["global"]);
});

test("section_missing, too_long and script_check are global", () => {
  const p = parseDraft(CLEAN, presence);
  const at = locateFlags(p, [
    { code: "section_missing", severity: "warning", detail: "8 sections, expected 9" },
    { code: "too_long", severity: "warning", detail: "800 words (limit 700)" },
    { code: "script_check", severity: "warning", detail: "10% of the text is in Telugu script (expected at least 70%)" },
  ]);
  assert.deepEqual([...at.keys()], ["global"]);
  assert.equal(at.get("global")!.length, 3);
});

test("a missing drug lands on medicines", () => {
  const { where } = place(CLEAN.replace("| Atorvastatin | 80 mg | once a day (OD) | |\n", ""));
  assert.deepEqual(where("drug_missing"), ["medicines"]);
});

test("an extra drug lands where it is written — prose in 'done'", () => {
  const { where } = place(CLEAN.replace("placed one stent in the LAD", "placed one stent in the LAD and gave clopidogrel"));
  assert.deepEqual(where("drug_extra"), ["done"]);
});

test("an extra drug written only in the medicines table lands on medicines", () => {
  const { where } = place(CLEAN.replace("| GTN | | only when needed (PRN) | |", "| GTN | | only when needed (PRN) | |\n| Clopidogrel | | once a day (OD) | |"));
  assert.deepEqual(where("drug_extra"), ["medicines"]);
});

test("a forbidden phrase lands on the section that contains it", () => {
  const { where } = place(CLEAN.replace("Please stop smoking.", "Please stop smoking. Weight: not recorded."));
  assert.deepEqual(where("forbidden_phrase"), ["care"]);
});

test("a token in two sections goes to the first, in document order", () => {
  const draft = CLEAN.replace("The LAD was 100% blocked.", "The LAD was 97% blocked.").replace("Please stop smoking.", "Please stop smoking 97 times.");
  assert.deepEqual(place(draft).where("number_unknown"), ["found"]);
});

test("numbers match whole: '5' is not found inside '15' or '45'; unmatched → global", () => {
  const p = parseDraft(CLEAN, presence);
  const at = locateFlags(p, [{ code: "number_unknown", severity: "error", detail: "5 does not appear in the record" }]);
  assert.deepEqual([...at.keys()], ["global"]);
});

test("a fallback draft puts every flag in global", () => {
  const draft = CLEAN.replace("## Follow-up\n", "").replace("| 90 mg |", "| 95 mg |");
  const { at } = place(draft);
  assert.deepEqual([...at.keys()], ["global"]);
});

test("medicine_row_unmatched (UI-only) lands on medicines", () => {
  const at = locateFlags(parseDraft(CLEAN, presence), [{ code: "medicine_row_unmatched", severity: "warning", detail: "Clopidogrel is in the draft's table but not in the record" }]);
  assert.deepEqual([...at.keys()], ["medicines"]);
});

test("every flag is placed exactly once", () => {
  const draft = CLEAN.replace("| 90 mg |", "| 95 mg |").replace("The LAD was 100% blocked.", "The LAD was 97% blocked.").replace("Please stop smoking.", "N/A");
  const { flags, at } = place(draft);
  assert.ok(flags.length >= 4);
  assert.equal([...at.values()].flat().length, flags.length);
});

// ─── All 114 real v6 drafts, all six languages ───────────────────────────────

const DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "drafts");
const pres = JSON.parse(readFileSync(join(DIR, "presence.json"), "utf8")).current as Record<string, Presence>;

test("v6 drafts, every language: an invented number planted in 'What we found' is placed on found", () => {
  let checked = 0;
  for (const f of readdirSync(join(DIR, "v6")).filter((x) => x.endsWith(".md"))) {
    const text = readFileSync(join(DIR, "v6", f), "utf8");
    const p = presenceOf(f);
    const parsed = parseDraft(text, p);
    const found = parsed.sections.find((s) => s.key === "found")!;
    const planted = text.replace(found.body, found.body.replace(/\S/, (c) => `987 ${c}`));
    assert.notEqual(planted, text, f);
    const at = locateFlags(parseDraft(planted, p), [{ code: "number_unknown", severity: "error", detail: "987 does not appear in the record" }]);
    assert.deepEqual([...at.keys()], ["found"], f);
    checked++;
  }
  assert.equal(checked, 114);
});

function presenceOf(f: string): Presence {
  return pres[f.split(".")[0]];
}

test("v9: a blocked word is placed by its own pattern ('Fr' not inside 'From')", () => {
  const draft = CLEAN.replace("You had a heart attack (STEMI).", "From the record: you had a heart attack (STEMI).").replace("we placed one stent", "through a 6 Fr tube we placed one stent");
  const placed = locateFlags(parseDraft(draft, presence), [{ code: "forbidden_phrase", severity: "error", detail: 'contains "Fr"' }]);
  assert.equal([...placed.keys()][0], "done");
});
