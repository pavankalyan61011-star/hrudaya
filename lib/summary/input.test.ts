/**
 * Summary input (Week 4 spec §4, §9). Synthetic fixture; no database.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummaryInput, inputHash } from "./input.ts";
import { fixture } from "../fhir/test-fixture.ts";

/** Every value in a JSON tree, as strings, for leak checks. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (typeof v === "object") Object.values(v as object).forEach((x) => allStrings(x, out));
  else out.push(String(v));
  return out;
}

function hasNull(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v === "object" && v) return Object.values(v as object).some(hasNull);
  return false;
}

test("no patient name, DOB, MRN, lot, expiry or UDI anywhere in the input", () => {
  const p = fixture();
  const json = JSON.stringify(buildSummaryInput(p));
  const forbidden = [
    p.patient.full_name, p.patient.date_of_birth, p.patient.mrn,
    ...p.interventions.flatMap((i) => i.devices_used.flatMap((d) => [d.lot_number, d.expiry_date, d.udi])),
  ].filter((x): x is string => !!x);
  assert.ok(forbidden.length >= 6, "the fixture has identifiers to leak (guards a vacuous check)");
  for (const f of forbidden) assert.ok(!json.includes(f), `leaked: ${f}`);
  // Free text excluded: lesion notes.
  assert.ok(!json.includes("Thrombotic occlusion"));
});

test("age and sex only for the patient", () => {
  const input = buildSummaryInput(fixture());
  assert.deepEqual(input.patient, { age_years: 66, sex: "male" });
});

test("null fields are omitted, never sent as null", () => {
  const input = buildSummaryInput(fixture({
    admitted_at: null, urgency: null, lvef_status: "not_recorded", lvef_pct: null, lvef_source: null, lvef_measured_on: null,
  }));
  assert.equal(hasNull(input), false);
  assert.equal("admitted_at" in input.episode, false);
  assert.equal("urgency" in input.episode, false);
  assert.equal("lvef_pct" in input.measurements, false);
  // PRN GTN has no dose: dose and unit absent, the rest present.
  const gtn = input.medications.find((m) => m.drug_name === "GTN")!;
  assert.equal("dose" in gtn, false);
  assert.equal("unit" in gtn, false);
  assert.equal(gtn.frequency, "PRN");
  assert.ok(!allStrings(input).some((s) => /not recorded/i.test(s)));
});

test("three-state LVEF: only a recorded value is sent", () => {
  assert.equal(buildSummaryInput(fixture()).measurements.lvef_pct, 45);
  assert.equal("lvef_pct" in buildSummaryInput(fixture({ lvef_status: "not_performed", lvef_pct: null, lvef_source: null, lvef_measured_on: null })).measurements, false);
});

test("medications exactly as stored, frequency abbreviation in Latin script", () => {
  const meds = buildSummaryInput(fixture()).medications;
  assert.deepEqual(meds[1], { drug_name: "Ticagrelor", dose: 90, unit: "mg", frequency: "BD", route: "oral", is_dapt: true, duration: "12 months" });
  assert.deepEqual(meds.map((m) => m.drug_name), ["Aspirin", "Ticagrelor", "Atorvastatin", "GTN"]);
});

test("not yet discharged: no discharge block, no medications, no discharged_at", () => {
  const input = buildSummaryInput(fixture({ discharge: null }));
  assert.equal("discharge" in input, false);
  assert.deepEqual(input.medications, []);
  assert.equal("discharged_at" in input.episode, false);
});

test("stable hash across two builds; changes when the record changes", () => {
  const a = buildSummaryInput(fixture());
  const b = buildSummaryInput(fixture());
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same key order");
  assert.equal(inputHash(a), inputHash(b));
  assert.match(inputHash(a), /^[0-9a-f]{64}$/);
  assert.notEqual(inputHash(a), inputHash(buildSummaryInput(fixture({ contrast_volume_ml: 101 }))));
});
