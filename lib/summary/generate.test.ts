/**
 * draftSummary with a fake model call — no network, no key. Checks what is sent, and that a
 * refused, truncated or empty reply is refused rather than stored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fhir/test-fixture.ts";
import { buildSummaryInput } from "./input.ts";
import { draftSummary, SummaryModelError, type ModelCall, type ModelReply, type ModelRequest } from "./generate.ts";

const input = buildSummaryInput(fixture());

function fake(reply: Partial<ModelReply>): ModelCall & { seen: ModelRequest[] } {
  const seen: ModelRequest[] = [];
  const call = async (req: ModelRequest) => {
    seen.push(req);
    return { text: "## A\nAspirin 75 mg", model: "claude-sonnet-5-5", tokens_in: 1200, tokens_out: 600, stop_reason: "end_turn", ...reply };
  };
  return Object.assign(call, { seen });
}

test("sends the system prompt and exactly one user message: the input JSON", async () => {
  const call = fake({});
  await draftSummary(input, "te", call);
  assert.equal(call.seen.length, 1);
  const [req] = call.seen;
  assert.match(req.system, /Write the body in Telugu/);
  assert.equal(req.messages.length, 1);
  assert.deepEqual(JSON.parse(req.messages[0].content), input);
});

test("what is sent carries no name, date of birth, MRN, lot, expiry or UDI", async () => {
  const call = fake({});
  await draftSummary(input, "en", call);
  const sent = JSON.stringify(call.seen[0]);
  for (const leak of ["Synthetic Test Patient", "1960-01-01", "SYN-TEST-1", "SYN-S-1", "2028-01-31", "(01)TEST"]) {
    assert.ok(!sent.includes(leak), `${leak} was sent to the model`);
  }
});

test("returns the draft, the model that wrote it, tokens and audit flags", async () => {
  const d = await draftSummary(input, "en", fake({ model: "claude-sonnet-5" }));
  assert.equal(d.draft_text, "## A\nAspirin 75 mg");
  assert.equal(d.model, "claude-sonnet-5"); // a fallback model is recorded as such
  assert.equal(d.tokens_in, 1200);
  assert.equal(d.tokens_out, 600);
  assert.ok(d.audit_flags.some((f) => f.code === "drug_missing" && /Ticagrelor/.test(f.detail)));
});

for (const [stop_reason, text, kind] of [
  ["refusal", "", "refused"],
  ["max_tokens", "## A\nAspirin 75 mg OD\n## B\nTicag", "truncated"],
  ["end_turn", "", "empty"],
] as const) {
  test(`${kind}: refused, nothing returned to store`, async () => {
    await assert.rejects(draftSummary(input, "en", fake({ stop_reason, text })), (e: unknown) => {
      assert.ok(e instanceof SummaryModelError);
      assert.equal(e.kind, kind);
      assert.ok(!e.message.includes("Aspirin"), "error message must not echo the draft");
      assert.deepEqual(e.billed, { tokens_in: 1200, tokens_out: 600 }, "billed tokens are kept for cost accounting");
      return true;
    });
  });
}
