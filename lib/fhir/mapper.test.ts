/**
 * Mapper unit tests (Week 2 spec §8). Node's built-in runner — no test dependency.
 *   npm test
 * The fixture is a small synthetic procedure built here; nothing touches the database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Bundle, Device, Encounter, MedicationRequest, Observation, Procedure, Condition } from "fhir/r4";
import type { FhirSource } from "./load.ts";
import { procedureToBundle, stableId } from "./mapper.ts";
import { HRUDAYA, SYNTHETIC_TAG } from "./codes.ts";

const NOW = "2026-10-15T12:00:00+05:30";

const OP = { id: "00000000-0000-4000-8000-000000000001", full_name: "Dr Test Operator", role: "interventional_cardiologist" };
const REVIEWER = { id: "00000000-0000-4000-8000-000000000002", full_name: "Dr Test Reviewer", role: "interventional_cardiologist" };
const FACILITY = { id: "00000000-0000-4000-8000-000000000003", name: "Synthetic Test Hospital", cath_lab_name: "Lab 1", city: "Testpur" };

function fixture(overrides: Record<string, unknown> = {}): FhirSource {
  const base = {
    id: "10000000-0000-4000-8000-000000000001",
    case_code: "PCI-TEST-001",
    status: "reviewed",
    procedure_type: "angiography_and_pci",
    indication: "stemi",
    urgency: "emergency",
    procedure_date: "2026-10-01",
    admitted_at: "2026-09-30T22:30:00+00:00",
    started_at: "2026-09-30T23:45:00+00:00",
    ended_at: "2026-10-01T00:30:00+00:00",
    reviewed_at: "2026-10-02T03:30:00+00:00",
    access_site: "right_radial",
    sheath_size_fr: 6,
    dominance: "right",
    outcome_summary: "Test impression.",
    contrast_agent: "Iohexol 350",
    contrast_volume_ml: 100,
    fluoroscopy_time_min: 10,
    air_kerma_mgy: 850,
    dap_gy_cm2: 65,
    baseline_bp_systolic: 120,
    baseline_bp_diastolic: 75,
    baseline_heart_rate: 88,
    creatinine_umol_l: 90,
    egfr: 80,
    haemoglobin_g_dl: 14,
    platelets_x10e9_l: 250,
    aortic_pressure_systolic: 114,
    aortic_pressure_diastolic: 71,
    lvedp_status: "recorded",
    lvedp_mmhg: 22,
    lvef_status: "recorded",
    lvef_pct: 45,
    lvef_source: "echo",
    lvef_measured_on: "2026-10-02",
    post_procedure_condition: "stable",
    post_procedure_destination: "ccu",
    immediate_care_notes: null,
    sheath_removed_at: null,
    patient: {
      id: "20000000-0000-4000-8000-000000000001",
      mrn: "SYN-TEST-1",
      full_name: "Synthetic Test Patient",
      sex: "male",
      date_of_birth: "1960-01-01",
      is_synthetic: true,
      risk_factors: [
        { id: "30000000-0000-4000-8000-000000000001", factor: "hypertension", detail: null },
        { id: "30000000-0000-4000-8000-000000000002", factor: "prior_pci", detail: "RCA DES" },
      ],
    },
    operator: OP,
    reviewer: REVIEWER,
    facility: FACILITY,
    vessel_findings: [
      { id: "40000000-0000-4000-8000-000000000001", vessel: "lmca", segment: null, stenosis_pct: 0, timi_flow: 3, is_culprit: false, lesion_notes: null, lesion_length_mm: null, calcification: null, thrombus: false, bifurcation: false },
      { id: "40000000-0000-4000-8000-000000000002", vessel: "lad", segment: "proximal", stenosis_pct: 100, timi_flow: 0, is_culprit: true, lesion_notes: "Thrombotic occlusion", lesion_length_mm: 20, calcification: "mild", thrombus: true, bifurcation: false },
    ],
    interventions: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        vessel_finding_id: "40000000-0000-4000-8000-000000000002",
        intervention_type: "pci_des",
        guidewire: "Test wire",
        residual_stenosis_pct: 0,
        timi_flow_post: 3,
        success: true,
        devices_used: [
          { id: "60000000-0000-4000-8000-000000000001", phase: "pre_dilation", category: "balloon_sc", product_name: "Test balloon", manufacturer: null, diameter_mm: 2.5, length_mm: 15, inflation_atm: 12, lot_number: "SYN-B-1", expiry_date: null, udi: null, quantity: 1 },
          { id: "60000000-0000-4000-8000-000000000002", phase: "deployment", category: "stent", product_name: "Test DES", manufacturer: "Synthetic Co", diameter_mm: 3.5, length_mm: 28, inflation_atm: 14, lot_number: "SYN-S-1", expiry_date: "2028-01-31", udi: "(01)TEST", quantity: 1 },
          { id: "60000000-0000-4000-8000-000000000003", phase: "deployment", category: "balloon_dcb", product_name: "Test DCB", manufacturer: null, diameter_mm: 3, length_mm: 20, inflation_atm: 8, lot_number: "SYN-D-1", expiry_date: null, udi: null, quantity: 1 },
        ],
      },
    ],
    procedure_medications: [
      { id: "70000000-0000-4000-8000-000000000001", drug_name: "Unfractionated heparin", dose: 70, dose_unit: "units_per_kg", route: "iv", timing: "intra_procedure", act_seconds: 270, administered_at: "2026-09-30T23:55:00+00:00", act_measured_at: "2026-10-01T00:00:00+00:00", notes: null },
      { id: "70000000-0000-4000-8000-000000000002", drug_name: "Intracoronary adenosine", dose: null, dose_unit: null, route: "intra_arterial", timing: "intra_procedure", act_seconds: null, administered_at: null, act_measured_at: null, notes: "for no-reflow" },
    ],
    complications: [],
    discharge: {
      id: "80000000-0000-4000-8000-000000000001",
      discharged_at: "2026-10-04T04:30:00+00:00",
      discharge_date: "2026-10-04",
      follow_up_date: "2026-10-15",
      follow_up_clinic: "Cardiology OPD",
      dapt_planned_months: 12,
      dapt_review_date: "2027-09-01",
      discharge_medications: [
        { id: "90000000-0000-4000-8000-000000000001", drug_name: "Aspirin", dose: 75, dose_unit: "mg", frequency: "od", route: "oral", duration: null, purpose: null, is_dapt: true },
        { id: "90000000-0000-4000-8000-000000000002", drug_name: "Ticagrelor", dose: 90, dose_unit: "mg", frequency: "bd", route: "oral", duration: "12 months", purpose: null, is_dapt: true },
        { id: "90000000-0000-4000-8000-000000000003", drug_name: "Atorvastatin", dose: 80, dose_unit: "mg", frequency: "od", route: "oral", duration: null, purpose: null, is_dapt: false },
        { id: "90000000-0000-4000-8000-000000000004", drug_name: "GTN", dose: null, dose_unit: null, frequency: "prn", route: "sublingual", duration: null, purpose: "angina relief", is_dapt: false },
      ],
    },
  };
  return { ...base, ...overrides } as unknown as FhirSource;
}

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
  assert.deepEqual(adenosine.effectivePeriod, { start: "2026-09-30T23:45:00+00:00", end: "2026-10-01T00:30:00+00:00" });
});
