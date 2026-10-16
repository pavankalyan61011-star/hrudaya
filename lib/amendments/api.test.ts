/**
 * Open/close amendment decision logic (Week 6 spec §2, §4) with fake dependencies: 401/404/409/422
 * as in earlier weeks, and the server's own recomputation of the changes being signed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fhir/test-fixture.ts";
import { snapshotProcedure } from "./snapshot.ts";
import { closeAmendment, currentChanges, openAmendment, type CloseDeps, type OpenAmendment, type OpenDeps } from "./api.ts";
import type { Change } from "./diff.ts";

const PID = "10000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000002";
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ─── open ─────────────────────────────────────────────────────────────────────

function openDeps(over: Partial<OpenDeps> = {}) {
  const calls: [string, string][] = [];
  const deps: OpenDeps = {
    getUser: async () => ({ id: "u1" }),
    open: async (id, reason) => (calls.push([id, reason]), { id: "a1", error: null }),
    ...over,
  };
  return { deps, calls };
}

test("open: 201 with the amendment id; the reason is trimmed before the database sees it", async () => {
  const { deps, calls } = openDeps();
  const r = await openAmendment(PID, { reason: "  Ticagrelor dose was 90 mg OD, should be BD  " }, deps);
  assert.equal(r.status, 201);
  assert.equal(r.body.amendment_id, "a1");
  assert.deepEqual(calls, [[PID, "Ticagrelor dose was 90 mg OD, should be BD"]]);
});

test("open: 401 when not signed in — the database is not called", async () => {
  const { deps, calls } = openDeps({ getUser: async () => null });
  assert.equal((await openAmendment(PID, { reason: "A reason long enough" }, deps)).status, 401);
  assert.equal(calls.length, 0);
});

test("open: 404 for a malformed id; 422 for a missing or short reason — no database call", async () => {
  const { deps, calls } = openDeps();
  assert.equal((await openAmendment("nope", { reason: "A reason long enough" }, deps)).status, 404);
  for (const body of [null, {}, { reason: "short" }, { reason: "         x" }, { reason: 42 }]) {
    assert.equal((await openAmendment(PID, body, deps)).status, 422, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

test("open: database refusals map to 404 / 409 / 422 / 401", async () => {
  const cases: [Any, number][] = [
    [{ code: "P0002", hint: "hrudaya:procedure_not_found" }, 404],
    [{ code: "P0001", hint: "hrudaya:amend_needs_reviewed" }, 409],
    [{ code: "23505" }, 409],
    [{ code: "P0001", hint: "hrudaya:amendment_reason_too_short" }, 422],
    [{ code: "P0001", hint: "hrudaya:amendment_needs_user" }, 401],
    [{ code: "XX000" }, 500],
  ];
  for (const [error, status] of cases) {
    const r = await openAmendment(PID, { reason: "A reason long enough" }, openDeps({ open: async () => ({ id: null, error }) }).deps);
    assert.equal(r.status, status, JSON.stringify(error));
  }
});

// ─── close ────────────────────────────────────────────────────────────────────

const amendingWithDose = (dose: number) => {
  const p = fixture({ status: "amending" }) as unknown as Any;
  p.discharge.discharge_medications = p.discharge.discharge_medications.map((m: Any) => (m.drug_name === "Ticagrelor" ? { ...m, dose } : m));
  return p;
};
const OPEN: OpenAmendment = { id: "a1", amendment_no: 1, snapshot: snapshotProcedure(fixture() as never) };

function closeDeps(over: Partial<CloseDeps> = {}, procedure: Any = amendingWithDose(60)) {
  const closed: Change[][] = [];
  const deps: CloseDeps = {
    getUser: async () => ({ id: "u1" }),
    load: async () => ({ procedure: procedure as never, error: null }),
    loadOpen: async () => ({ amendment: OPEN, error: null }),
    close: async (_id, _c, changes) => (closed.push(changes), { error: null }),
    ...over,
  };
  return { deps, closed };
}
const signed = currentChanges(OPEN, amendingWithDose(60) as never);

test("close: 200 when the signed list equals the server's; the server's list is what is stored", async () => {
  assert.equal(signed.length, 1);
  assert.equal(signed[0].label, "Discharge medication · Ticagrelor · dose");
  const { deps, closed } = closeDeps();
  const r = await closeAmendment(PID, { reviewing_clinician_id: OP, changes: signed }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(closed, [signed]);
});

test("close: the same list with keys in another order is accepted (canonical comparison)", async () => {
  const reordered = signed.map((c) => ({ kind: c.kind, after: c.after, before: c.before, label: c.label, path: c.path }));
  assert.equal((await closeAmendment(PID, { reviewing_clinician_id: OP, changes: reordered }, closeDeps().deps)).status, 200);
});

test("close: 409 with the fresh list when the record changed after the list was shown", async () => {
  const { deps, closed } = closeDeps({}, amendingWithDose(45));
  const r = await closeAmendment(PID, { reviewing_clinician_id: OP, changes: signed }, deps);
  assert.equal(r.status, 409);
  assert.equal((r.body.changes as Change[])[0].after, 45);
  assert.equal(closed.length, 0);
});

test("close: an unchanged record signs an empty list", async () => {
  const { deps, closed } = closeDeps({}, fixture({ status: "amending" }) as Any);
  assert.equal((await closeAmendment(PID, { reviewing_clinician_id: OP, changes: [] }, deps)).status, 200);
  assert.deepEqual(closed, [[]]);
});

test("close: 401 / 404 / 422 before any database call", async () => {
  const none = closeDeps({ getUser: async () => null });
  assert.equal((await closeAmendment(PID, { reviewing_clinician_id: OP, changes: [] }, none.deps)).status, 401);
  const { deps, closed } = closeDeps();
  assert.equal((await closeAmendment("nope", { reviewing_clinician_id: OP, changes: [] }, deps)).status, 404);
  for (const body of [null, {}, { reviewing_clinician_id: "x", changes: [] }, { reviewing_clinician_id: OP }, { reviewing_clinician_id: OP, changes: {} }]) {
    assert.equal((await closeAmendment(PID, body, deps)).status, 422, JSON.stringify(body));
  }
  assert.equal(closed.length, 0);
});

test("close: 404 unknown procedure; 409 when not amending or no open amendment", async () => {
  assert.equal((await closeAmendment(PID, { reviewing_clinician_id: OP, changes: [] }, closeDeps({ load: async () => ({ procedure: null, error: null }) }).deps)).status, 404);
  assert.equal((await closeAmendment(PID, { reviewing_clinician_id: OP, changes: [] }, closeDeps({}, fixture() as Any).deps)).status, 409);
  assert.equal((await closeAmendment(PID, { reviewing_clinician_id: OP, changes: signed }, closeDeps({ loadOpen: async () => ({ amendment: null, error: null }) }).deps)).status, 409);
});

test("close: database refusals map to 409 / 422", async () => {
  const cases: [Any, number][] = [
    [{ code: "P0001", hint: "hrudaya:amendment_diff_mismatch" }, 409],
    [{ code: "P0001", hint: "hrudaya:amendment_not_open" }, 409],
    [{ code: "P0001", hint: "hrudaya:pci_without_intervention" }, 422],
    [{ code: "P0001", hint: "hrudaya:no_vessel_findings" }, 422],
    [{ code: "23514", message: "procedures_completed_is_complete" }, 422],
    [{ code: "23503" }, 422],
  ];
  for (const [error, status] of cases) {
    const r = await closeAmendment(PID, { reviewing_clinician_id: OP, changes: signed }, closeDeps({ close: async () => ({ error }) }).deps);
    assert.equal(r.status, status, JSON.stringify(error));
  }
});
