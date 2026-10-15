/**
 * Spec §9: "no name/DOB/MRN/lot/UDI in output for any seeded case" — checked against the real
 * seeded rows, read-only. Needs the database:
 *   npm run test:seeded
 * Prints case codes only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadProcedureForFhir } from "../fhir/load.ts";
import { buildSummaryInput, inputHash } from "./input.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("every seeded discharged case: no identifiers in the summary input; stable hash", async () => {
  assert.ok(url && key, "run with npm run test:seeded (needs .env.local)");
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  const { data: rows } = await db.from("procedures").select("id, case_code").eq("status", "reviewed").is("created_by", null).order("case_code");
  assert.ok(rows && rows.length >= 20, `seeded reviewed cases found: ${rows?.length ?? 0}`);
  let discharged = 0;
  for (const r of rows!) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { procedure: p } = await loadProcedureForFhir(db as any, r.id);
    assert.ok(p, r.case_code);
    if (!p!.discharge) continue;
    discharged++;
    const input = buildSummaryInput(p!);
    const json = JSON.stringify(input);
    const forbidden = [
      p!.patient.full_name, p!.patient.date_of_birth, p!.patient.mrn,
      ...p!.interventions.flatMap((i) => i.devices_used.flatMap((d) => [d.lot_number, d.expiry_date, d.udi])),
    ].filter((x): x is string => !!x);
    for (const f of forbidden) assert.ok(!json.includes(f), `${r.case_code}: identifier leaked into the input`);
    assert.ok(!/null/.test(json), `${r.case_code}: a null was sent`);
    assert.equal(inputHash(buildSummaryInput(p!)), inputHash(input), `${r.case_code}: hash not stable`);
  }
  assert.equal(discharged, 19, "19 seeded cases are discharged (CAG-2026-020 is not)");
});
