/**
 * GET /api/fhir/procedures/[id] decision logic (spec §9 step 4), with fake dependencies.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportProcedure, type ExportDeps } from "./export.ts";
import { fixture } from "./test-fixture.ts";

const ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-10-15T12:00:00+05:30";

function deps(overrides: Partial<ExportDeps> = {}): ExportDeps & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    getUser: async () => ({ id: "user-1" }),
    load: async (id) => {
      loads.push(id);
      return { procedure: fixture(), error: null };
    },
    now: () => NOW,
    ...overrides,
  };
}

test("401 when not signed in — and the procedure is never loaded", async () => {
  const d = deps({ getUser: async () => null });
  const r = await exportProcedure(ID, d);
  assert.equal(r.status, 401);
  assert.equal(r.body.resourceType, "OperationOutcome");
  assert.equal(d.loads.length, 0);
});

test("404 for a malformed id, without a database call", async () => {
  const d = deps();
  const r = await exportProcedure("not-a-uuid", d);
  assert.equal(r.status, 404);
  assert.equal(d.loads.length, 0);
});

test("404 when the procedure does not exist (or RLS hides it)", async () => {
  const r = await exportProcedure(ID, deps({ load: async () => ({ procedure: null, error: null }) }));
  assert.equal(r.status, 404);
});

test("409 for a draft", async () => {
  const r = await exportProcedure(ID, deps({ load: async () => ({ procedure: fixture({ status: "draft" }), error: null }) }));
  assert.equal(r.status, 409);
  assert.equal(r.body.resourceType, "OperationOutcome");
});

test("500 when loading fails, with no row data in the message", async () => {
  const r = await exportProcedure(ID, deps({ load: async () => ({ procedure: null, error: { code: "XX000", message: "boom Synthetic Test Patient" } }) }));
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /Synthetic Test Patient/);
});

test("200 for a reviewed procedure: document Bundle, final Composition, case-code filename", async () => {
  const r = await exportProcedure(ID, deps());
  assert.equal(r.status, 200);
  if (r.status !== 200) return;
  assert.equal(r.body.type, "document");
  assert.equal(r.body.timestamp, NOW);
  assert.equal(r.filename, "PCI-TEST-001.fhir.json");
  assert.equal((r.body.entry?.[0].resource as { status?: string }).status, "final");
});

test("200 for a completed (not yet reviewed) procedure, Composition preliminary", async () => {
  const r = await exportProcedure(ID, deps({ load: async () => ({ procedure: fixture({ status: "completed", reviewer: null, reviewed_at: null }), error: null }) }));
  assert.equal(r.status, 200);
  if (r.status !== 200) return;
  assert.equal((r.body.entry?.[0].resource as { status?: string }).status, "preliminary");
});

test("409 while an amendment is in progress — nothing exported", async () => {
  const r = await exportProcedure(ID, deps({ load: async () => ({ procedure: fixture({ status: "amending" }), error: null }) }));
  assert.equal(r.status, 409);
  assert.equal(r.body.resourceType, "OperationOutcome");
});
