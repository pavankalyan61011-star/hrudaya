/**
 * Week 6 spec §3, §6: diffSnapshots on the synthetic fixture. Each test changes one thing on a fresh
 * copy of the record and checks the exact change list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fhir/test-fixture.ts";
import { snapshotProcedure } from "./snapshot.ts";
import { diffSnapshots } from "./diff.ts";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const COMPLICATION = {
  id: "c0000000-0000-4000-8000-000000000001", procedure_id: "10000000-0000-4000-8000-000000000001", complication: "access_site_haematoma",
  severity: "minor", management: "Compression and observation", onset: "inpatient", onset_at: "2026-10-01T09:40:00+00:00", outcome: "Resolved",
};
const base = (): Any => ({ ...(fixture({ complications: [{ ...COMPLICATION }] }) as unknown as Any) });
const snap = (p: Any) => snapshotProcedure(p as never);
const before = snap(base());

test("no change → []", () => {
  assert.deepEqual(diffSnapshots(before, snap(base())), []);
});

test("re-saving a step (new ids, timestamps and order for child rows) is not a change", () => {
  const p = base();
  p.vessel_findings = [...p.vessel_findings].reverse().map((v: Any) => ({ ...v, created_at: "2026-10-16T00:00:00+00:00" }));
  const vfId = new Map(p.vessel_findings.map((v: Any) => [v.id, `n-${v.id}`]));
  p.vessel_findings = p.vessel_findings.map((v: Any) => ({ ...v, id: vfId.get(v.id) }));
  p.interventions = p.interventions.map((i: Any) => ({
    ...i, id: "new-intervention", vessel_finding_id: vfId.get(i.vessel_finding_id),
    devices_used: [...i.devices_used].reverse().map((d: Any, n: number) => ({ ...d, id: `new-device-${n}`, intervention_id: "new-intervention" })),
  }));
  p.discharge = { ...p.discharge, id: "new-discharge", discharge_medications: [...p.discharge.discharge_medications].reverse().map((m: Any) => ({ ...m, id: `n-${m.id}` })) };
  p.complications = p.complications.map((c: Any) => ({ ...c, id: "new-complication", updated_at: "2026-10-16T00:00:00+00:00" }));
  assert.deepEqual(diffSnapshots(before, snap(p)), []);
});

test("dose change on a discharge medication", () => {
  const p = base();
  p.discharge.discharge_medications = p.discharge.discharge_medications.map((m: Any) => (m.drug_name === "Ticagrelor" ? { ...m, dose: 60 } : m));
  assert.deepEqual(diffSnapshots(before, snap(p)), [
    { path: "discharge.medications[Ticagrelor].dose", label: "Discharge medication · Ticagrelor · dose", before: 90, after: 60, kind: "changed" },
  ]);
});

test("device lot number added (was empty)", () => {
  const b = base();
  b.interventions[0].devices_used = b.interventions[0].devices_used.map((d: Any) => (d.product_name === "Test DCB" ? { ...d, lot_number: null } : d));
  const a = base(); // the fixture's DCB has lot SYN-D-1
  assert.deepEqual(diffSnapshots(snap(b), snap(a)), [
    {
      path: "interventions[lad/proximal/pci_des].devices[deployment/balloon_dcb/Test DCB/3×20].lot_number",
      label: "Device · Test DCB 3×20 · lot number", before: null, after: "SYN-D-1", kind: "changed",
    },
  ]);
});

test("complication outcome edited", () => {
  const p = base();
  p.complications = [{ ...COMPLICATION, outcome: "Resolved; ultrasound excluded pseudoaneurysm" }];
  assert.deepEqual(diffSnapshots(before, snap(p)), [
    {
      path: "complications[access_site_haematoma].outcome", label: "Complication · Access-site haematoma · outcome",
      before: "Resolved", after: "Resolved; ultrasound excluded pseudoaneurysm", kind: "changed",
    },
  ]);
});

test("red-flag item removed", () => {
  const p = base();
  p.discharge = { ...p.discharge, red_flags: ["Recurrent chest pain"] };
  assert.deepEqual(diffSnapshots(before, snap(p)), [
    { path: "discharge.red_flags[Significant bleeding]", label: "Discharge · red flag removed", before: "Significant bleeding", after: null, kind: "removed" },
  ]);
});

test("red flags reordered (same items) is one change — order carries the urgency groups", () => {
  const p = base();
  p.discharge = { ...p.discharge, red_flags: [...p.discharge.red_flags].reverse() };
  const d = diffSnapshots(before, snap(p));
  assert.equal(d.length, 1);
  assert.equal(d[0].label, "Discharge · red flags reordered");
});

test("arrays match by natural key: a vessel finding added, another's stenosis changed", () => {
  const p = base();
  p.vessel_findings = [
    ...p.vessel_findings.map((v: Any) => (v.vessel === "lmca" ? { ...v, stenosis_pct: 30 } : v)),
    { ...p.vessel_findings[0], id: "added-vf", vessel: "rca", segment: "mid", stenosis_pct: 50, timi_flow: 3 },
  ];
  const d = diffSnapshots(before, snap(p));
  assert.deepEqual(d.map((c) => [c.kind, c.label]), [
    ["changed", "Vessel finding · LMCA · stenosis %"],
    ["added", "Vessel finding · Mid RCA · added"],
  ]);
  assert.equal(d[0].before, 0);
  assert.equal(d[0].after, 30);
});

test("a device removed; a procedure field changed; a medication added", () => {
  const p = base();
  p.interventions[0].devices_used = p.interventions[0].devices_used.filter((d: Any) => d.category !== "balloon_sc");
  p.outcome_summary = "Amended impression.";
  p.discharge.discharge_medications = [...p.discharge.discharge_medications, { ...p.discharge.discharge_medications[2], id: "new", drug_name: "Ramipril", dose: 2.5 }];
  const d = diffSnapshots(before, snap(p));
  assert.deepEqual(d.map((c) => [c.kind, c.label]), [
    ["changed", "Procedure · outcome summary"],
    ["removed", "Device · Test balloon 2.5×15 · removed"],
    ["added", "Discharge medication · Ramipril · added"],
  ]);
});

test("discharge added where there was none", () => {
  const d = diffSnapshots(snap({ ...base(), discharge: null }), before);
  assert.deepEqual(d.map((c) => [c.kind, c.path]), [["added", "discharge"]]);
});

test("fields an amendment cannot change are not in the diff (case code, date, patient, review fields)", () => {
  const p = base();
  Object.assign(p, { case_code: "PCI-OTHER", procedure_date: "2030-01-01", patient_id: "x", status: "amending", reviewed_at: null, reviewing_clinician_id: null });
  p.patient = { ...p.patient, full_name: "Someone Else" };
  assert.deepEqual(diffSnapshots(before, snap(p)), []);
});

// ─── Week 7 (0011) tables ─────────────────────────────────────────────────────

const LAD = "40000000-0000-4000-8000-000000000002";
const withPhysiology = (value: number): Any => {
  const p = base();
  p.vessel_findings = p.vessel_findings.map((v: Any) =>
    v.id === LAD ? { ...v, lesion_physiology: [{ id: "phys-1", vessel_finding_id: LAD, phase: "pre", index: "ffr", value, hyperaemic_agent: "adenosine_iv", agent_dose: null, decision: "defer", method: "pressure_wire", image_study_uid: null, image_series_uid: null, source: "typed", recorded_by: null, recorded_at: "2026-10-18T00:00:00+00:00", notes: null }] } : v);
  return p;
};

test("Week 7: a physiology value changed on a lesion", () => {
  const d = diffSnapshots(snap(withPhysiology(0.86)), snap(withPhysiology(0.78)));
  assert.deepEqual(d, [
    { path: "vessel_findings[lad/proximal].physiology[pre/ffr].value", label: "Physiology · Proximal LAD · FFR pre · value", before: 0.86, after: 0.78, kind: "changed" },
  ]);
});

test("Week 7: an outcome goes from not recorded to yes (tri-state, not a boolean)", () => {
  const outcome = (mi: string): Any => ({ ...base(), in_hospital_outcomes: { id: "o1", procedure_id: "x", mi, stroke: "not_recorded", event_links: [], recorded_at: "t", recorded_by: null } });
  assert.deepEqual(diffSnapshots(snap(outcome("not_recorded")), snap(outcome("yes"))), [
    { path: "in_hospital_outcomes.mi", label: "In-hospital outcome · MI", before: "not_recorded", after: "yes", kind: "changed" },
  ]);
});

test("Week 7: a graft and its graft lesion added; graft lesions keyed by their graft", () => {
  const p = base();
  const graft = { id: "g1", procedure_id: "x", graft_type: "svg", target_vessel: "om1", sequential: false, patency: "stenosed", stenosis_pct: 85, lesion_location: "body", cabg_year: 2014, source: "typed", recorded_at: "t", recorded_by: null, notes: null };
  p.grafts = [graft, { ...graft, id: "g2", graft_type: "lima", target_vessel: "lad", patency: "patent", stenosis_pct: null, lesion_location: null }];
  p.vessel_findings = [...p.vessel_findings,
    { ...p.vessel_findings[0], id: "gv1", vessel: "graft", segment: null, stenosis_pct: 85, graft_id: "g1" },
    { ...p.vessel_findings[0], id: "gv2", vessel: "graft", segment: null, stenosis_pct: 0, graft_id: "g2" }];
  assert.deepEqual(diffSnapshots(before, snap(p)).map((c) => [c.kind, c.label]), [
    ["added", "Vessel finding · Graft lesion · LIMA to LAD · added"],
    ["added", "Vessel finding · Graft lesion · SVG to OM1 · added"],
    ["added", "Graft · LIMA to LAD · added"],
    ["added", "Graft · SVG to OM1 · added"],
  ]);
});

test("Week 7: an inflation added to a device's log", () => {
  const p = base();
  p.interventions[0].devices_used = p.interventions[0].devices_used.map((d: Any) =>
    d.product_name === "Test DES" ? { ...d, device_inflations: [{ id: "f1", device_id: d.id, sequence: 1, pressure_atm: 14, duration_s: 20, source: "typed", recorded_at: "t", recorded_by: null, notes: null }] } : d);
  assert.deepEqual(diffSnapshots(before, snap(p)).map((c) => [c.kind, c.label]), [["added", "Device · Test DES 3.5×28 · inflation 1 · added"]]);
});

test("Week 7: haemodynamics marked not performed (three-state) is a change", () => {
  const h = (left_status: string, ao: number | null): Any => ({ ...base(), haemodynamics: { id: "h", procedure_id: "x", left_status, ao_systolic: ao, ao_diastolic: null, ao_mean: null, lv_systolic: null, lv_edp: null, heart_rate_at_measurement: null, rhythm: null, source: "typed", recorded_at: "t", recorded_by: null, notes: null } });
  assert.deepEqual(diffSnapshots(snap(h("recorded", 130)), snap(h("not_performed", null))).map((c) => c.label), [
    "Haemodynamics · aortic systolic (mmHg)", "Haemodynamics · left heart",
  ]);
});
