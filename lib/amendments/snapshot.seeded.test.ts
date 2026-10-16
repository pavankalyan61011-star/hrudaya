/**
 * Week 6 spec §3, §6: the TypeScript snapshot equals the SQL snapshot (public.procedure_snapshot)
 * for every reviewed procedure in the database the env names. Read-only.
 *   npm run test:seeded
 * Prints case codes only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadProcedureForFhir } from "../fhir/load.ts";
import { canonicalJson, snapshotProcedure } from "./snapshot.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("snapshot parity: TypeScript = SQL for every reviewed procedure", async () => {
  assert.ok(url && key, "run with npm run test:seeded (needs .env.local)");
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  const { data: rows, error } = await db.from("procedures").select("id, case_code").eq("status", "reviewed").order("case_code");
  assert.ifError(error);
  assert.ok(rows && rows.length >= 20, `reviewed procedures found: ${rows?.length ?? 0}`);
  const mismatched: string[] = [];
  for (const r of rows!) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { procedure } = await loadProcedureForFhir(db as any, r.id);
    assert.ok(procedure, r.case_code);
    const { data: sql, error: rpcError } = await db.rpc("procedure_snapshot", { p_procedure_id: r.id });
    assert.ifError(rpcError);
    const ts = snapshotProcedure(procedure!);
    if (canonicalJson(ts) !== canonicalJson(sql)) mismatched.push(r.case_code);
    // An unchanged record snapshots byte-identically twice.
    assert.equal(canonicalJson(snapshotProcedure(procedure!)), canonicalJson(ts), `${r.case_code}: not deterministic`);
  }
  assert.deepEqual(mismatched, [], `TS ≠ SQL for: ${mismatched.join(", ")}`);
  console.log(`parity: ${rows!.length} reviewed procedures, TS = SQL for all`);
});
