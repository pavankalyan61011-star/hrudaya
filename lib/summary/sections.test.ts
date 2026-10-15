/**
 * Week 5 spec §3, §8: parseDraft ⇄ serialiseDraft. The same byte-identity check as
 * `npm run summary:roundtrip`, over the committed fixtures (all 114 v6 eval drafts, and the 37 v1
 * drafts that fall back), plus hand-written edge cases. No database, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  draftTableRows, editableText, medicinesAfterText, parseDraft, presenceFromInput, serialiseDraft, withSectionText, type Presence,
} from "./sections.ts";
import { buildSummaryInput } from "./input.ts";
import { fixture } from "../fhir/test-fixture.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "drafts");
const presence = JSON.parse(readFileSync(join(DIR, "presence.json"), "utf8")) as { current: Record<string, Presence>; beforeV4: Record<string, Presence> };
const drafts = (sub: string) => readdirSync(join(DIR, sub)).filter((f) => f.endsWith(".md")).map((f) => ({ f, text: readFileSync(join(DIR, sub, f), "utf8") }));

test("v6 fixtures: 114 drafts, all byte-identical and all structured", () => {
  const all = drafts("v6");
  assert.equal(all.length, 114);
  const mismatched = all.filter(({ f, text }) => serialiseDraft(parseDraft(text, presence.current[f.split(".")[0]])) !== text);
  assert.deepEqual(mismatched.map((d) => d.f), []);
  const fallback = all.filter(({ f, text }) => parseDraft(text, presence.current[f.split(".")[0]]).fallback);
  assert.deepEqual(fallback.map((d) => d.f), []);
});

test("v6 fixtures: the medicines table is found in every draft and no table row is left in a body", () => {
  for (const { f, text } of drafts("v6")) {
    const p = parseDraft(text, presence.current[f.split(".")[0]]);
    assert.ok(p.medicinesTable && draftTableRows(p.medicinesTable).length > 0, `${f}: table`);
    assert.ok(!p.sections.some((s) => s.body.split("\n").some((l) => l.trim().startsWith("|"))), `${f}: table row left in a body`);
  }
});

test("v1 fallback fixtures: 37 drafts with a section the record does not hold — fallback, still byte-identical", () => {
  const all = drafts("v1-fallback");
  assert.equal(all.length, 37);
  for (const { f, text } of all) {
    const p = parseDraft(text, presence.beforeV4[f.split(".")[0]]);
    assert.equal(p.fallback, true, f);
    assert.equal(p.sections.length, 1);
    assert.equal(p.sections[0].key, "unknown");
    assert.equal(serialiseDraft(p), text, f);
  }
});

test("a broken serialiser is caught (the identity check is not vacuous)", () => {
  const { f, text } = drafts("v6")[0];
  const p = parseDraft(text, presence.current[f.split(".")[0]]);
  const broken = { ...p, sections: p.sections.map((s, i) => (i === 1 ? { ...s, body: s.body.slice(0, -1) } : s)) };
  assert.notEqual(serialiseDraft(broken), text);
});

// ─── Presence comes from the record, not the text ────────────────────────────

const ALL: Presence = { pump: true, care: true, urgent: true };
const md = (headings: string[]) => headings.map((h) => `## ${h}\n\nText for ${h}.\n`).join("\n");
const NINE = ["Why", "Done", "Found", "Pump", "Medicines", "Care", "Urgent", "Follow-up", "Team"];

test("presenceFromInput: pump from LVEF, care from advice, urgent from red flags", () => {
  assert.deepEqual(presenceFromInput(buildSummaryInput(fixture())), ALL);
  const none = buildSummaryInput(fixture({ lvef_status: "not_recorded", lvef_pct: null, discharge: { ...fixture().discharge, advice: [], red_flags: [] } }));
  assert.deepEqual(presenceFromInput(none), { pump: false, care: false, urgent: false });
});

test("the same eight headings map differently depending on the record", () => {
  const eight = md(NINE.filter((h) => h !== "Urgent"));
  const noUrgent = parseDraft(eight, { pump: true, care: true, urgent: false });
  assert.equal(noUrgent.sections.find((s) => s.key === "pump")!.heading, "Pump");
  assert.equal(noUrgent.sections.find((s) => s.key === "urgent")!.present, false);
  // Same text, record says no LVEF but red flags: "Pump" lands on the why..found chain shifted.
  const noPump = parseDraft(eight, { pump: false, care: true, urgent: true });
  assert.equal(noPump.sections.find((s) => s.key === "pump")!.present, false);
  assert.equal(noPump.sections.find((s) => s.key === "medicines")!.heading, "Pump");
  assert.equal(serialiseDraft(noUrgent), eight);
  assert.equal(serialiseDraft(noPump), eight);
});

test("wrong heading count → fallback with the whole text in one 'unknown' section; never throws", () => {
  for (const text of [md(NINE.slice(0, 7)), md([...NINE, "Extra"]), "no headings at all", "", "### only level three\n"]) {
    const p = parseDraft(text, ALL);
    assert.equal(p.fallback, true);
    assert.equal(p.sections[0].key, "unknown");
    assert.equal(serialiseDraft(p), text);
  }
  assert.doesNotThrow(() => parseDraft(undefined as unknown as string, ALL));
});

test("exact whitespace: preamble, CRLF, no trailing newline, heading at end of text, ### inside a body", () => {
  const cases = [
    "Preamble line\n\n" + md(NINE),
    md(NINE).replace(/\n/g, "\r\n"),
    md(NINE).trimEnd(),
    md(NINE.slice(0, 8)) + "\n## Team",
    md(NINE).replace("Text for Done.", "Text for Done.\n### a sub-heading\nmore"),
  ];
  for (const text of cases) assert.equal(serialiseDraft(parseDraft(text, ALL)), text);
});

// ─── Medicines table and editing ──────────────────────────────────────────────

const WITH_TABLE = md(NINE).replace(
  "## Medicines\n\nText for Medicines.\n",
  "## Medicines\n\n| Drug | Dose | How often | For how long |\n|---|---|---|---|\n| Aspirin (DAPT) | 75 mg | once a day (OD) | |\n| Ticagrelor (DAPT) | 90 mg | twice a day (BD) | 12 months |\n\nDAPT: Aspirin and Ticagrelor.\n\nDo not stop these medicines.\n",
);

test("the medicines table is cut out of the body and re-inserted at the same place", () => {
  const p = parseDraft(WITH_TABLE, ALL);
  const meds = p.sections.find((s) => s.key === "medicines")!;
  assert.ok(p.medicinesTable!.startsWith("| Drug |"));
  assert.ok(!meds.body.includes("|"));
  assert.equal(medicinesAfterText(meds), "DAPT: Aspirin and Ticagrelor.\n\nDo not stop these medicines.");
  assert.deepEqual(draftTableRows(p.medicinesTable).map((r) => r.cells[0]), ["Aspirin (DAPT)", "Ticagrelor (DAPT)"]);
  assert.equal(serialiseDraft(p), WITH_TABLE);
});

test("editing a section keeps the layout around it; editing medicines never touches the table", () => {
  const p = parseDraft(WITH_TABLE, ALL);
  const edited = withSectionText(p, "why", "You had a heart attack.");
  const out = serialiseDraft(edited);
  assert.ok(out.includes("## Why\n\nYou had a heart attack.\n\n## Done"));
  assert.equal(out.replace("You had a heart attack.", "Text for Why."), WITH_TABLE);

  const m = withSectionText(p, "medicines", "DAPT: Aspirin and Ticagrelor, two tablets.");
  const mout = serialiseDraft(m);
  assert.ok(mout.includes(p.medicinesTable!), "table unchanged");
  assert.ok(mout.includes("| Ticagrelor (DAPT) | 90 mg | twice a day (BD) | 12 months |\n\nDAPT: Aspirin and Ticagrelor, two tablets.\n\n## Care"));
  assert.equal(editableText(m.sections.find((s) => s.key === "why")!), "Text for Why.");
});
