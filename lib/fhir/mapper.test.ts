/**
 * Mapper unit tests (Week 2 spec §8). Node's built-in runner — no test dependency.
 *   npm test
 * The fixture is a small synthetic procedure built here; nothing touches the database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Bundle, Composition, Device, Encounter, MedicationRequest, Observation, Procedure, Provenance, Condition } from "fhir/r4";
import { fixture } from "./test-fixture.ts";
import { procedureToBundle, stableId } from "./mapper.ts";
import { HRUDAYA, SYNTHETIC_TAG } from "./codes.ts";

const NOW = "2026-10-15T12:00:00+05:30";

const resources = <T>(b: Bundle, type: string) => (b.entry ?? []).map((e) => e.resource).filter((r) => r?.resourceType === type) as T[];
const obsByText = (b: Bundle, text: string) => resources<Observation>(b, "Observation").filter((o) => o.code.text === text);
/** Every reference value, e.g. "urn:uuid:…". */
const allRefs = (b: Bundle) => (JSON.stringify(b).match(/"reference":"urn:uuid:[0-9a-f-]+"/g) ?? []).map((r) => r.slice(13, -1));

// ─── Document shape ────────────────────────────────────────────────────────────

test("document bundle: Composition first, every reference resolves inside the bundle", () => {
  const b = procedureToBundle(fixture(), NOW);
  assert.equal(b.type, "document");
  assert.equal(b.entry?.[0].resource?.resourceType, "Composition");
  assert.deepEqual(b.identifier, { system: HRUDAYA.caseCodeSystem, value: "PCI-TEST-001" });
  const fullUrls = new Set(b.entry!.map((e) => e.fullUrl));
  assert.equal(fullUrls.size, b.entry!.length, "fullUrls unique");
  const refs = allRefs(b);
  assert.ok(refs.length > 50, "references were found (guards against a regex that matches nothing)");
  for (const r of refs) assert.ok(fullUrls.has(r), `dangling reference ${r}`);
  for (const e of b.entry!) assert.equal(e.fullUrl, `urn:uuid:${e.resource!.id}`);
});

test("synthetic tag on Bundle and Patient", () => {
  const b = procedureToBundle(fixture(), NOW);
  assert.deepEqual(b.meta?.tag, [SYNTHETIC_TAG]);
  assert.deepEqual(resources<{ meta?: { tag?: unknown[] } }>(b, "Patient")[0].meta?.tag, [SYNTHETIC_TAG]);
});

test("Composition status follows review: final when reviewed (with attester), preliminary when completed", () => {
  const reviewed = resources<{ status: string; attester?: unknown[] }>(procedureToBundle(fixture(), NOW), "Composition")[0];
  assert.equal(reviewed.status, "final");
  assert.equal(reviewed.attester?.length, 1);
  const completed = resources<{ status: string; attester?: unknown[] }>(procedureToBundle(fixture({ status: "completed", reviewer: null, reviewed_at: null }), NOW), "Composition")[0];
  assert.equal(completed.status, "preliminary");
  assert.equal(completed.attester, undefined);
});

// ─── Three-state Observations ──────────────────────────────────────────────────

test("three-state LVEF/LVEDP: recorded → value; not_performed → dataAbsentReason; not_recorded → no Observation", () => {
  const recorded = procedureToBundle(fixture(), NOW);
  const lvef = obsByText(recorded, "Left ventricular ejection fraction");
  assert.equal(lvef.length, 1);
  assert.equal(lvef[0].valueQuantity?.value, 45);
  assert.equal(lvef[0].dataAbsentReason, undefined);
  assert.equal(lvef[0].method?.text, "Echocardiography");
  assert.equal(lvef[0].effectiveDateTime, "2026-10-02");
  assert.equal(obsByText(recorded, "Left ventricular end-diastolic pressure")[0].valueQuantity?.value, 22);

  const notPerformed = procedureToBundle(fixture({ lvef_status: "not_performed", lvef_pct: null, lvef_source: null, lvef_measured_on: null, lvedp_status: "not_performed", lvedp_mmhg: null }), NOW);
  for (const text of ["Left ventricular ejection fraction", "Left ventricular end-diastolic pressure"]) {
    const o = obsByText(notPerformed, text);
    assert.equal(o.length, 1, text);
    assert.equal(o[0].valueQuantity, undefined, text);
    assert.equal(o[0].dataAbsentReason?.coding?.[0].code, "not-performed", text);
  }

  const notRecorded = procedureToBundle(fixture({ lvef_status: "not_recorded", lvef_pct: null, lvef_source: null, lvef_measured_on: null, lvedp_status: "not_recorded", lvedp_mmhg: null }), NOW);
  assert.equal(obsByText(notRecorded, "Left ventricular ejection fraction").length, 0);
  assert.equal(obsByText(notRecorded, "Left ventricular end-diastolic pressure").length, 0);
});

// ─── DAPT ──────────────────────────────────────────────────────────────────────

test("DAPT: both DAPT rows carry category and the dapt-plan extension; other rows do not", () => {
  const reqs = resources<MedicationRequest>(procedureToBundle(fixture(), NOW), "MedicationRequest");
  const dapt = reqs.filter((r) => r.category?.[0]?.text === "DAPT");
  assert.deepEqual(dapt.map((r) => r.medicationCodeableConcept?.text).sort(), ["Aspirin", "Ticagrelor"]);
  for (const r of dapt) {
    const ext = r.extension?.find((e) => e.url === HRUDAYA.extDaptPlan);
    assert.ok(ext, "dapt-plan extension");
    assert.deepEqual(ext!.extension, [{ url: "plannedMonths", valueInteger: 12 }, { url: "reviewDate", valueDate: "2027-09-01" }]);
  }
  const statin = reqs.find((r) => r.medicationCodeableConcept?.text === "Atorvastatin")!;
  assert.equal(statin.extension, undefined);
  assert.equal(statin.category, undefined);
  const tica = reqs.find((r) => r.medicationCodeableConcept?.text === "Ticagrelor")!;
  assert.deepEqual(tica.dispenseRequest?.expectedSupplyDuration, { value: 12, unit: "months", system: "http://unitsofmeasure.org", code: "mo" });
  const gtn = reqs.find((r) => r.medicationCodeableConcept?.text === "GTN")!;
  assert.equal(gtn.dosageInstruction?.[0].asNeededBoolean, true);
  assert.equal(gtn.dosageInstruction?.[0].doseAndRate, undefined, "no dose for PRN GTN");
});

// ─── Not yet discharged ────────────────────────────────────────────────────────

test("not yet discharged: Encounter in-progress with no end, no MedicationRequests, Discharge section empty", () => {
  const b = procedureToBundle(fixture({ discharge: null }), NOW);
  const enc = resources<Encounter>(b, "Encounter")[0];
  assert.equal(enc.status, "in-progress");
  assert.equal(enc.period?.end, undefined);
  assert.equal(enc.period?.start, "2026-09-30T22:30:00+00:00");
  assert.equal(resources(b, "MedicationRequest").length, 0);
  const section = resources<{ section: { title: string; entry?: unknown[]; emptyReason?: { coding: { code: string }[] } }[] }>(b, "Composition")[0].section.find((s) => s.title === "Discharge")!;
  assert.equal(section.entry, undefined);
  assert.equal(section.emptyReason?.coding[0].code, "notstarted");
});

test("discharged: Encounter finished with period end", () => {
  const enc = resources<Encounter>(procedureToBundle(fixture(), NOW), "Encounter")[0];
  assert.equal(enc.status, "finished");
  assert.equal(enc.period?.end, "2026-10-04T04:30:00+00:00");
  assert.equal(enc.class.code, "IMP");
});

// ─── Devices ───────────────────────────────────────────────────────────────────

test("devices: one Device per row; focalDevice links stent (implanted) and DCB (applied), not balloons", () => {
  const b = procedureToBundle(fixture(), NOW);
  const devices = resources<Device>(b, "Device");
  assert.equal(devices.length, 3);
  const stent = devices.find((d) => d.lotNumber === "SYN-S-1")!;
  assert.equal(stent.expirationDate, "2028-01-31");
  assert.equal(stent.udiCarrier?.[0].carrierHRF, "(01)TEST");
  assert.equal(stent.manufacturer, "Synthetic Co");
  const proc = resources<Procedure>(b, "Procedure")[0];
  const focal = proc.focalDevice ?? [];
  assert.equal(focal.length, 2);
  const byRef = new Map(focal.map((f) => [f.manipulated.reference, f.action?.text]));
  assert.equal(byRef.get("urn:uuid:60000000-0000-4000-8000-000000000002"), "implanted");
  assert.equal(byRef.get("urn:uuid:60000000-0000-4000-8000-000000000003"), "applied");
  assert.equal(byRef.has("urn:uuid:60000000-0000-4000-8000-000000000001"), false);
});

// ─── Stable ids ────────────────────────────────────────────────────────────────

test("stable ids: re-export gives identical content apart from the timestamp", () => {
  const a = procedureToBundle(fixture(), NOW);
  const b = procedureToBundle(fixture(), "2027-01-01T00:00:00+05:30");
  assert.deepEqual(a.entry!.map((e) => e.fullUrl), b.entry!.map((e) => e.fullUrl));
  assert.deepEqual({ ...a, timestamp: "x" }, { ...b, timestamp: "x" });
  assert.equal(stableId("a", "b"), stableId("a", "b"));
  assert.notEqual(stableId("a", "b"), stableId("a", "c"));
  assert.match(stableId("a"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// ─── Codes ─────────────────────────────────────────────────────────────────────

test("codes: verified codes emitted; rejected ones text-only (never a guessed coding)", () => {
  const b = procedureToBundle(fixture(), NOW);
  const conds = resources<Condition>(b, "Condition");
  const indication = conds.find((c) => c.category?.[0]?.text === "Indication for procedure")!;
  assert.equal(indication.code?.coding?.[0].code, "401303003", "STEMI is 401303003");
  const priorPci = conds.find((c) => c.code?.text?.startsWith("Prior pci"))!;
  assert.equal(priorPci.code?.coding, undefined, "prior PCI is text-only");
  const lmca = resources<Observation>(b, "Observation").find((o) => o.code.text?.includes("LMCA"))!;
  assert.equal(lmca.bodySite?.coding, undefined, "LMCA body site is text-only");
  const act = obsByText(b, "Activated clotting time")[0];
  assert.equal(act.code.coding?.[0].code, "3184-9");
  assert.deepEqual(act.partOf, [{ reference: "urn:uuid:70000000-0000-4000-8000-000000000001", display: "Unfractionated heparin" }]);
});

test("medication given with no recorded time is bounded by its phase, not given an invented time", () => {
  const b = procedureToBundle(fixture(), NOW);
  const adenosine = resources<{ medicationCodeableConcept: { text: string }; effectiveDateTime?: string; effectivePeriod?: { start?: string; end?: string } }>(b, "MedicationAdministration")
    .find((m) => m.medicationCodeableConcept.text === "Intracoronary adenosine")!;
  assert.equal(adenosine.effectiveDateTime, undefined);
  assert.equal((adenosine as { dosage?: unknown }).dosage, undefined, "mad-1: no dosage without a dose");
  assert.match((adenosine as { note?: { text: string }[] }).note?.[0].text ?? "", /Intra-arterial/);
  assert.deepEqual(adenosine.effectivePeriod, { start: "2026-09-30T23:45:00+00:00", end: "2026-10-01T00:30:00+00:00" });
});

// ─── Week 6: amendments ────────────────────────────────────────────────────────

const AMEND_REVIEWER = { id: "00000000-0000-4000-8000-0000000000a9", full_name: "Dr Amend Reviewer", role: "interventional_cardiologist" };
const amendment = (no: number, changes: unknown[]) => ({
  id: `a0000000-0000-4000-8000-00000000000${no}`, amendment_no: no, status: "closed", reason: `Reason for amendment ${no}`,
  opened_at: "2026-10-16T05:00:00+00:00", closed_at: `2026-10-16T0${5 + no}:00:00+00:00`, changes, reviewer: AMEND_REVIEWER,
});
const CHANGE = { path: "discharge.medications[Ticagrelor].dose", label: "Discharge medication · Ticagrelor · dose", before: 90, after: 60, kind: "changed" };

test("amendments: no amendments → final, no Provenance, no Amendments section", () => {
  const b = procedureToBundle(fixture(), NOW);
  const c = b.entry![0].resource as Composition;
  assert.equal(c.status, "final");
  assert.equal(b.entry!.filter((e) => e.resource?.resourceType === "Provenance").length, 0);
  assert.ok(!c.section!.some((s) => s.title === "Amendments"));
});

test("amendments: a signed amendment with changes → amended, one Provenance, referenced from the Amendments section", () => {
  const b = procedureToBundle(fixture({ amendments: [amendment(1, [CHANGE])] }), NOW);
  const c = b.entry![0].resource as Composition;
  assert.equal(c.status, "amended");
  const prov = b.entry!.filter((e) => e.resource?.resourceType === "Provenance").map((e) => e.resource as Provenance);
  assert.equal(prov.length, 1);
  assert.deepEqual(prov[0].target, [{ reference: `urn:uuid:${c.id}` }]);
  assert.equal(prov[0].recorded, "2026-10-16T06:00:00+00:00");
  assert.deepEqual(prov[0].activity!.coding, [{ system: "http://terminology.hl7.org/CodeSystem/v3-DataOperation", code: "UPDATE", display: "revise" }]);
  assert.equal(prov[0].agent[0].who.reference, `urn:uuid:${AMEND_REVIEWER.id}`);
  assert.equal(prov[0].reason![0].text, "Reason for amendment 1");
  const section = c.section!.find((s) => s.title === "Amendments")!;
  assert.deepEqual(section.entry, [{ reference: `urn:uuid:${prov[0].id}` }]);
  assert.ok(b.entry!.some((e) => e.resource?.resourceType === "Practitioner" && e.resource.id === AMEND_REVIEWER.id), "re-reviewer is in the Bundle");
});

test("amendments: a no-change amendment stays final, is listed in the narrative, and has no Provenance", () => {
  const b = procedureToBundle(fixture({ amendments: [amendment(1, [])] }), NOW);
  const c = b.entry![0].resource as Composition;
  assert.equal(c.status, "final");
  const section = c.section!.find((s) => s.title === "Amendments")!;
  assert.match(section.text!.div, /Amendment #1/);
  assert.equal(section.entry, undefined);
  assert.equal(b.entry!.filter((e) => e.resource?.resourceType === "Provenance").length, 0);
});

test("amendments: Provenance ids are stable across exports", () => {
  const ids = () => procedureToBundle(fixture({ amendments: [amendment(1, [CHANGE]), amendment(2, [CHANGE])] }), NOW).entry!
    .filter((e) => e.resource?.resourceType === "Provenance").map((e) => e.resource!.id);
  assert.deepEqual(ids(), ids());
  assert.equal(new Set(ids()).size, 2);
});
