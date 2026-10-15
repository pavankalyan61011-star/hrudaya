/**
 * HAPI round-trip (spec §6): POST PCI-2026-001's document Bundle to the public HAPI R4 test server,
 * read it back by the server-assigned id, and print that id and the entry count.
 *
 *   npm run fhir:hapi
 *
 * Public HAPI is a shared test server: synthetic data only — every Bundle carries the
 * "synthetic" meta.tag. Prints ids and counts only, never patient fields.
 */
import { createClient } from "@supabase/supabase-js";
import type { Bundle } from "fhir/r4";
import { loadProcedureForFhir } from "../lib/fhir/load.ts";
import { procedureToBundle } from "../lib/fhir/mapper.ts";

const BASE = "https://hapi.fhir.org/baseR4";
const CASE = "PCI-2026-001";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: row } = await db.from("procedures").select("id, status").eq("case_code", CASE).single();
if (!row || row.status !== "reviewed") {
  console.error(`${CASE} not found or not reviewed.`);
  process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { procedure } = await loadProcedureForFhir(db as any, row.id);
if (!procedure || !procedure.patient.is_synthetic) {
  console.error("Refusing: only synthetic patients may be sent to a public server.");
  process.exit(1);
}

const bundle = procedureToBundle(procedure, new Date().toISOString());
// HAPI rejects a create whose body carries an id; the server assigns one.
const { id: _localId, ...body } = bundle;

const post = await fetch(`${BASE}/Bundle`, {
  method: "POST",
  headers: { "Content-Type": "application/fhir+json", Accept: "application/fhir+json", Prefer: "return=representation" },
  body: JSON.stringify(body),
});
const created = (await post.json()) as Bundle & { issue?: { diagnostics?: string }[] };
if (!post.ok || !created.id) {
  console.error(`POST failed: HTTP ${post.status} ${created.issue?.map((i) => i.diagnostics).join("; ") ?? ""}`);
  process.exit(1);
}

const get = await fetch(`${BASE}/Bundle/${created.id}`, { headers: { Accept: "application/fhir+json" } });
const readBack = (await get.json()) as Bundle;
const tagged = readBack.meta?.tag?.some((t) => t.code === "synthetic") ?? false;

console.log(`POST ${BASE}/Bundle → HTTP ${post.status}`);
console.log(`Server id: ${created.id}`);
console.log(`GET  ${BASE}/Bundle/${created.id} → HTTP ${get.status}`);
console.log(`Entries sent ${bundle.entry?.length ?? 0}, read back ${readBack.entry?.length ?? 0}; type ${readBack.type}; synthetic tag ${tagged ? "present" : "MISSING"}`);
if (!get.ok || (readBack.entry?.length ?? 0) !== (bundle.entry?.length ?? 0)) process.exit(1);
