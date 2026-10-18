/**
 * Summary input (Week 4 spec §4, §9). Synthetic fixture; no database.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummaryInput, inputHash, inputHashFor } from "./input.ts";
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

test("complications: sent with outcome and management; omitted without an outcome; text clipped at 300", () => {
  const long = "Managed with compression and observation. ".repeat(20);
  const c = (over: Record<string, unknown>) => ({
    id: "c", complication: "access_site_haematoma", severity: "minor", management: "Compression", outcome: "Resolved",
    onset: "inpatient", onset_at: null, ...over,
  });
  const input = buildSummaryInput(fixture({ complications: [
    c({}),
    c({ complication: "no_reflow", onset: "intraprocedural", outcome: "   " }),
    c({ complication: "dissection", outcome: null }),
    c({ complication: "arrhythmia", management: long, outcome: `  Settled\n with   treatment ` }),
  ] }));
  assert.deepEqual(input.complications, [
    { name: "Bruise or swelling at the access site (haematoma)", onset: "after the procedure, in hospital", management: "Compression", outcome: "Resolved" },
    { name: "Irregular heartbeat", onset: "after the procedure, in hospital", management: long.trim().slice(0, 299) + "…", outcome: "Settled with treatment" },
  ]);
  assert.equal(input.complications[1].management!.length, 300);
});

test("stable hash across two builds; changes when the record changes", () => {
  const a = buildSummaryInput(fixture());
  const b = buildSummaryInput(fixture());
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same key order");
  assert.equal(inputHash(a), inputHash(b));
  assert.match(inputHash(a), /^[0-9a-f]{64}$/);
  assert.notEqual(inputHash(a), inputHash(buildSummaryInput(fixture({ contrast_volume_ml: 101 }))));
});

// ─── Week 7 (prompt v7) ──────────────────────────────────────────────────────

test("v7: no Week 7 data → no Week 7 keys, so the Week 6 input and hash are unchanged", () => {
  const input = buildSummaryInput(fixture());
  assert.equal("in_hospital_events" in input, false);
  for (const f of input.findings) assert.deepEqual(Object.keys(f), ["vessel", "stenosis_pct", "timi_flow"]);
});

test("v7: physiology, imaging and in-hospital events are sent; STEMI times, BARC and creatinine are not", () => {
  const NOW = "2026-10-18T00:00:00Z";
  const p = fixture();
  const v = p.vessel_findings[0];
  p.vessel_findings[0] = {
    ...v,
    lesion_physiology: [{ id: "00000000-0000-4000-8000-0000000007b1", vessel_finding_id: v.id, phase: "pre", index: "ffr", value: 0.78, hyperaemic_agent: "adenosine_iv", agent_dose: "140 µg/kg/min", decision: "treat", method: "pressure_wire", image_study_uid: null, image_series_uid: null, source: "typed", recorded_by: null, recorded_at: NOW, notes: "free text never sent" }],
    intravascular_imaging: [
      { id: "00000000-0000-4000-8000-0000000007b3", vessel_finding_id: v.id, modality: "ivus", phase: "post", mla_mm2: null, eem_area_mm2: null, plaque_burden_pct: null, calcium_arc_deg: null, calcium_thickness_mm: null, lipid_arc_deg: null, max_lcbi_4mm: null, msa_mm2: 6.4, stent_expansion_pct: 88, malapposition: false, edge_dissection: null, pullback_length_mm: null, image_study_uid: null, image_series_uid: null, image_instance_uid: null, mla_frame: null, method: "manual", source: "typed", recorded_by: null, recorded_at: NOW, notes: null },
      { id: "00000000-0000-4000-8000-0000000007b2", vessel_finding_id: v.id, modality: "ivus", phase: "pre", mla_mm2: 2.9, eem_area_mm2: 11.2, plaque_burden_pct: 74, calcium_arc_deg: null, calcium_thickness_mm: null, lipid_arc_deg: null, max_lcbi_4mm: null, msa_mm2: null, stent_expansion_pct: null, malapposition: null, edge_dissection: null, pullback_length_mm: null, image_study_uid: null, image_series_uid: null, image_instance_uid: null, mla_frame: null, method: "manual", source: "typed", recorded_by: null, recorded_at: NOW, notes: null },
    ],
  };
  p.in_hospital_outcomes = {
    id: "00000000-0000-4000-8000-0000000007b4", procedure_id: p.id, mi: "no", stroke: "not_recorded", death: "no", death_cause: null,
    bleeding: "yes", bleeding_barc: 3, bleeding_barc_sub: "a", transfusion: "yes", aki: "yes", creatinine_post_umol_l: 212, new_dialysis: "no",
    emergency_cabg: "no", cardiac_tamponade: "no", unplanned_repeat_pci: "no", vascular_status: "yes", vascular_complications: ["haematoma"],
    disposition: "home", event_links: [], source: "typed", recorded_by: null, recorded_at: NOW, notes: null,
  };
  const input = buildSummaryInput(p);
  assert.deepEqual(input.findings[0].physiology, [{ test: "FFR", value: 0.78, when: "before treatment", decision: "treat" }]);
  // Pre before post; the pre row carries no numbers, the post row the stent result only.
  assert.deepEqual(input.findings[0].imaging, [
    { test: "IVUS", when: "before treatment" },
    { test: "IVUS", when: "after treatment", stent_expansion_pct: 88, malapposition: false },
  ]);
  assert.deepEqual(input.in_hospital_events, [
    "Bleeding", "Blood transfusion", "Kidney strain (acute kidney injury)", "Bruise or swelling at the access site (haematoma)",
  ]);
  const json = JSON.stringify(input);
  for (const leaked of ["212", "BARC", "140 µg", "free text never sent", "6.4", "2.9", "74"]) assert.ok(!json.includes(leaked), `leaked: ${leaked}`);
});

// ─── v8 ───────────────────────────────────────────────────────────────────────

test("v8: no sheath size and no guidewire or catheter is sent; the v7 builder keeps them for old rows' hashes", () => {
  const p = fixture();
  assert.ok(p.sheath_size_fr, "the fixture has a sheath size (guards a vacuous check)");
  const i0 = p.interventions[0];
  p.interventions[0] = {
    ...i0,
    devices_used: [...i0.devices_used, { ...i0.devices_used[0], id: "00000000-0000-4000-8000-0000000008a1", category: "guidewire", product_name: "Synthetic workhorse wire" }],
  };
  const now = buildSummaryInput(p);
  assert.equal(now.access && "sheath_size_fr" in now.access, false);
  assert.ok(!JSON.stringify(now).includes("Synthetic workhorse wire"));
  const old = buildSummaryInput(p, "v7");
  assert.equal(old.access?.sheath_size_fr, p.sheath_size_fr);
  assert.ok(JSON.stringify(old).includes("Synthetic workhorse wire"));
  assert.equal(inputHashFor(p, "v7"), inputHash(old));
  assert.equal(inputHashFor(p, "v1"), inputHash(old));
  assert.equal(inputHashFor(p, "v8"), inputHash(now));
  assert.notEqual(inputHash(old), inputHash(now));
});

test("v8: a lesion inside an earlier stent says so; the v7 builder does not", () => {
  const p = fixture();
  p.vessel_findings[0] = { ...p.vessel_findings[0], in_stent_restenosis: true, isr_pattern: "focal" };
  assert.equal(buildSummaryInput(p).findings[0].inside_earlier_stent, true);
  assert.equal("inside_earlier_stent" in buildSummaryInput(p, "v7").findings[0], false);
  assert.equal("inside_earlier_stent" in buildSummaryInput(fixture()).findings[0], false);
});
