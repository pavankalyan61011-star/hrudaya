/**
 * The summary routes' decision logic (spec §6) with fake dependencies and a mocked model:
 * 401 / 404 / 409 / 503 / 429 / 422, plus 400, 502 and the success paths. No network, no DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fhir/test-fixture.ts";
import { buildSummaryInput, inputHash } from "./input.ts";
import { generateSummary, saveSummary, DAILY_CAP, type GenerateDeps, type ApproveDeps, type LogEvent } from "./api.ts";
import { SummaryModelError, type ModelCall, type ModelReply, type SummaryRow } from "./generate.ts";

const PID = "10000000-0000-4000-8000-000000000001";
const SID = "a0000000-0000-4000-8000-000000000001";
const CLINICIAN = "00000000-0000-4000-8000-000000000002";

/** A clean English draft for the fixture (it passes the audit with no flags). */
const CLEAN = `## Why you were in hospital
You had a heart attack (STEMI).
## What was done
One stent in the LAD (front heart artery), through the right wrist.
## What we found
The LAD was 100% blocked.
## Your heart pump
Your heart pump (LVEF) is 45%.
## Your medicines
| Drug | Dose | How often | For how long |
|---|---|---|---|
| Aspirin (DAPT) | 75 mg | OD | |
| Ticagrelor (DAPT) | 90 mg | BD | 12 months |
| Atorvastatin | 80 mg | OD | |
| GTN | | PRN | |
Do not stop these medicines without asking your cardiologist.
## Looking after yourself
Take DAPT every day. Stop smoking.
## When to come back urgently
Chest pain or heavy bleeding.
## Follow-up
Cardiology OPD, 2026-10-15.
## Your team
Dr Test Operator, Synthetic Test Hospital.`;

function mockModel(reply: Partial<ModelReply> | Error = {}): ModelCall & { calls: number } {
  const m = Object.assign(
    async () => {
      m.calls++;
      if (reply instanceof Error) throw reply;
      return { text: CLEAN, model: "claude-sonnet-5-5", tokens_in: 1400, tokens_out: 700, stop_reason: "end_turn", ...reply };
    },
    { calls: 0 },
  );
  return m;
}

function genDeps(over: Partial<GenerateDeps> = {}, model = mockModel()) {
  const logs: LogEvent[] = [];
  const saved: unknown[] = [];
  const deps: GenerateDeps = {
    getUser: async () => ({ id: "user-1" }),
    configured: () => true,
    load: async () => ({ procedure: fixture(), error: null }),
    countToday: async () => ({ count: 0, error: null }),
    modelCall: () => model,
    save: async (row) => {
      saved.push(row);
      return { row: { ...row, id: SID, version: 3, status: "draft" } as unknown as SummaryRow, error: null };
    },
    log: (e) => logs.push(e),
    clock: (() => { let t = 0; return () => (t += 1000); })(),
    ...over,
  };
  return { deps, logs, saved, model };
}

// ─── POST generate ────────────────────────────────────────────────────────────

test("201: drafts, audits, stores version, logs no text", async () => {
  const { deps, logs, saved, model } = genDeps();
  const r = await generateSummary(PID, { language: "te" }, deps);
  assert.equal(r.status, 201);
  assert.equal(model.calls, 1);
  const row = saved[0] as Record<string, unknown>;
  assert.equal(row.language, "te");
  assert.equal(row.prompt_version, "v1");
  assert.equal(row.input_hash, inputHash(buildSummaryInput(fixture())));
  assert.equal(row.tokens_in, 1400);
  assert.equal(row.tokens_out, 700);
  assert.ok(Array.isArray(row.audit_flags));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "summary_generated");
  const logged = JSON.stringify(logs);
  for (const text of ["Aspirin", "heart attack", "PCI-TEST-001", "Dr Test"]) assert.ok(!logged.includes(text), `log contains ${text}`);
});

test("401 when not signed in — nothing loaded, model not called", async () => {
  let loads = 0;
  const { deps, model } = genDeps({ getUser: async () => null, load: async () => (loads++, { procedure: fixture(), error: null }) });
  const r = await generateSummary(PID, { language: "en" }, deps);
  assert.equal(r.status, 401);
  assert.equal(loads, 0);
  assert.equal(model.calls, 0);
});

test("400 for a missing or unknown language", async () => {
  for (const body of [null, {}, { language: "fr" }, { language: "EN" }]) {
    assert.equal((await generateSummary(PID, body, genDeps().deps)).status, 400);
  }
});

test("404 for a malformed id or an unknown procedure", async () => {
  assert.equal((await generateSummary("nope", { language: "en" }, genDeps().deps)).status, 404);
  const { deps, model } = genDeps({ load: async () => ({ procedure: null, error: null }) });
  assert.equal((await generateSummary(PID, { language: "en" }, deps)).status, 404);
  assert.equal(model.calls, 0);
});

test("409 when not reviewed, or reviewed with no discharge — model not called", async () => {
  for (const proc of [fixture({ status: "completed" }), fixture({ status: "draft" }), fixture({ discharge: null })]) {
    const { deps, model } = genDeps({ load: async () => ({ procedure: proc, error: null }) });
    const r = await generateSummary(PID, { language: "en" }, deps);
    assert.equal(r.status, 409);
    assert.equal(model.calls, 0);
  }
});

test("503 when ANTHROPIC_API_KEY is unset — model not called", async () => {
  const { deps, model } = genDeps({ configured: () => false });
  const r = await generateSummary(PID, { language: "en" }, deps);
  assert.equal(r.status, 503);
  assert.equal(model.calls, 0);
});

test("429 at the daily cap (not at one below it)", async () => {
  const at = genDeps({ countToday: async () => ({ count: DAILY_CAP, error: null }) });
  assert.equal((await generateSummary(PID, { language: "en" }, at.deps)).status, 429);
  assert.equal(at.model.calls, 0);
  const below = genDeps({ countToday: async () => ({ count: DAILY_CAP - 1, error: null }) });
  assert.equal((await generateSummary(PID, { language: "en" }, below.deps)).status, 201);
});

test("500 when the daily count cannot be read — fails closed, model not called", async () => {
  const { deps, model } = genDeps({ countToday: async () => ({ count: null, error: { message: "x" } }) });
  assert.equal((await generateSummary(PID, { language: "en" }, deps)).status, 500);
  assert.equal(model.calls, 0);
});

test("model failures: refusal / truncation → 502, rate limit / bad key → 503; nothing stored", async () => {
  const cases: [Parameters<typeof mockModel>[0], number][] = [
    [{ stop_reason: "refusal", text: "" }, 502],
    [{ stop_reason: "max_tokens" }, 502],
    [new SummaryModelError("failed", "AI service error 500"), 502],
    [new SummaryModelError("rate_limited", "busy"), 503],
    [new SummaryModelError("not_configured", "bad key"), 503],
  ];
  for (const [reply, status] of cases) {
    const { deps, saved, logs } = genDeps({}, mockModel(reply));
    const r = await generateSummary(PID, { language: "hi" }, deps);
    assert.equal(r.status, status);
    assert.equal(saved.length, 0);
    assert.equal(logs[0].event, "summary_failed");
  }
});

test("409 when the insert trigger refuses or another version won the race", async () => {
  for (const error of [{ code: "P0001", hint: "hrudaya:summary_needs_reviewed" }, { code: "23505" }]) {
    const { deps } = genDeps({ save: async () => ({ row: null, error }) });
    assert.equal((await generateSummary(PID, { language: "en" }, deps)).status, 409);
  }
});

// ─── PUT save / approve ───────────────────────────────────────────────────────

function summaryRow(over: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: SID, procedure_id: PID, language: "en", version: 1, status: "draft", model: "claude-sonnet-5-5",
    prompt_version: "v1", input_hash: inputHash(buildSummaryInput(fixture())), draft_text: CLEAN, audit_flags: [],
    approved_text: null, approving_clinician_id: null, approved_by: null, approved_at: null,
    tokens_in: 1400, tokens_out: 700, generated_by: "user-1", generated_at: "2026-10-15T09:00:00Z", ...over,
  };
}

function putDeps(over: Partial<ApproveDeps> = {}) {
  const updates: unknown[] = [];
  const logs: LogEvent[] = [];
  const deps: ApproveDeps = {
    getUser: async () => ({ id: "user-1" }),
    loadSummary: async () => ({ summary: summaryRow(), error: null }),
    load: async () => ({ procedure: fixture(), error: null }),
    update: async (_id, patch) => {
      updates.push(patch);
      return { row: summaryRow({ ...patch, approved_at: patch.status === "approved" ? "2026-10-15T09:05:00Z" : null }), error: null };
    },
    log: (e) => logs.push(e),
    ...over,
  };
  return { deps, updates, logs };
}

const approve = (text = CLEAN) => ({ approved_text: text, approving_clinician_id: CLINICIAN, approve: true });

test("200: a clean text is approved; log has no text", async () => {
  const { deps, updates, logs } = putDeps();
  const r = await saveSummary(PID, SID, approve(), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(updates, [{ approved_text: CLEAN, approving_clinician_id: CLINICIAN, status: "approved" }]);
  assert.equal(logs[0].event, "summary_approved");
  assert.ok(!JSON.stringify(logs).includes("Aspirin"));
});

test("422 when the edited text has an error flag — nothing written", async () => {
  const { deps, updates } = putDeps();
  const r = await saveSummary(PID, SID, approve(CLEAN.replace("90 mg", "180 mg")), deps);
  assert.equal(r.status, 422);
  assert.ok(r.body.flags?.some((f) => f.code === "dose_mismatch"));
  assert.ok(r.body.flags?.some((f) => f.code === "number_unknown"));
  assert.equal(updates.length, 0);
});

test("warnings alone do not block approval", async () => {
  const r = await saveSummary(PID, SID, approve(CLEAN.replace("## Your team\n", "")), putDeps().deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.flags?.map((f) => f.code), ["section_missing"]);
});

test("approve: false saves an edit with error flags and leaves it a draft", async () => {
  const { deps, updates } = putDeps();
  const text = CLEAN.replace("90 mg", "180 mg");
  const r = await saveSummary(PID, SID, { approved_text: text, approve: false }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(updates, [{ approved_text: text, approving_clinician_id: null, status: "draft" }]);
  assert.ok(r.body.flags?.some((f) => f.severity === "error"));
});

test("401 when not signed in", async () => {
  assert.equal((await saveSummary(PID, SID, approve(), putDeps({ getUser: async () => null }).deps)).status, 401);
});

test("400 for an empty text, a missing clinician on approve, or a non-boolean approve", async () => {
  for (const body of [
    { ...approve(), approved_text: "   " },
    { approved_text: CLEAN, approve: true },
    { ...approve(), approving_clinician_id: "x" },
    { ...approve(), approve: "yes" },
    null,
  ]) {
    assert.equal((await saveSummary(PID, SID, body, putDeps().deps)).status, 400, JSON.stringify(body));
  }
});

test("400 for a clinician id that is not an operator (FK)", async () => {
  const { deps } = putDeps({ update: async () => ({ row: null, error: { code: "23503" } }) });
  assert.equal((await saveSummary(PID, SID, approve(), deps)).status, 400);
});

test("404 for an unknown summary, or a summary of another procedure", async () => {
  assert.equal((await saveSummary(PID, SID, approve(), putDeps({ loadSummary: async () => ({ summary: null, error: null }) }).deps)).status, 404);
  const other = putDeps({ loadSummary: async () => ({ summary: summaryRow({ procedure_id: "10000000-0000-4000-8000-000000000999" }), error: null }) });
  assert.equal((await saveSummary(PID, SID, approve(), other.deps)).status, 404);
  assert.equal((await saveSummary(PID, "bad", approve(), putDeps().deps)).status, 404);
});

test("409 when already approved — before any write", async () => {
  const { deps, updates } = putDeps({ loadSummary: async () => ({ summary: summaryRow({ status: "approved" }), error: null }) });
  assert.equal((await saveSummary(PID, SID, approve(), deps)).status, 409);
  assert.equal(updates.length, 0);
});

test("409 when approved between load and write (RLS returns no row, or the trigger refuses)", async () => {
  assert.equal((await saveSummary(PID, SID, approve(), putDeps({ update: async () => ({ row: null, error: null }) }).deps)).status, 409);
  const trig = putDeps({ update: async () => ({ row: null, error: { code: "P0001", hint: "hrudaya:summary_approved_immutable" } }) });
  assert.equal((await saveSummary(PID, SID, approve(), trig.deps)).status, 409);
});

test("409 when the record changed since the draft (input hash differs)", async () => {
  const { deps, updates } = putDeps({ loadSummary: async () => ({ summary: summaryRow({ input_hash: "0".repeat(64) }), error: null }) });
  assert.equal((await saveSummary(PID, SID, approve(), deps)).status, 409);
  assert.equal(updates.length, 0);
});
