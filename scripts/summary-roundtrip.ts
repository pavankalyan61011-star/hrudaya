/**
 * Week 5 spec §8: parseDraft → serialiseDraft must be byte-identical for every saved eval draft
 * and every discharge_summaries row.
 *
 *   npm run summary:roundtrip
 *
 * Reads every tmp/summaries*\/ directory (each has results.json naming its prompt version) and every
 * discharge_summaries row in the database named by NEXT_PUBLIC_SUPABASE_URL (read-only). Presence of
 * sections comes from each case's summary input — for drafts made by prompts v1–v3, from the
 * record as it was then: the 11 standard red-flag lists were added after v3 (docs/backlog.md, Data
 * corrections), so those drafts are judged with no red flags for those cases.
 *
 * Exits 1 on any byte mismatch. Prints counts and case codes only, never draft text.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadProcedureForFhir } from "../lib/fhir/load.ts";
import { buildSummaryInput } from "../lib/summary/input.ts";
import { parseDraft, presenceFromInput, serialiseDraft, type Presence } from "../lib/summary/sections.ts";

const RED_FLAGS_ADDED_AFTER_V3 = new Set([
  "PCI-2026-002", "PCI-2026-004", "PCI-2026-006", "PCI-2026-007", "PCI-2026-009", "PCI-2026-011",
  "PCI-2026-012", "PCI-2026-014", "PCI-2026-016", "CAG-2026-018", "CAG-2026-019",
]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(url, key, { auth: { persistSession: false } });

// Presence per procedure, from the current record.
const { data: procs, error } = await db.from("procedures").select("id, case_code").eq("status", "reviewed");
if (error) throw new Error(`Could not list procedures: ${error.code}`);
const presenceByCase = new Map<string, Presence>();
const presenceById = new Map<string, Presence>();
for (const p of procs ?? []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { procedure } = await loadProcedureForFhir(db as any, p.id);
  if (!procedure) continue;
  const presence = presenceFromInput(buildSummaryInput(procedure));
  presenceByCase.set(p.case_code, presence);
  presenceById.set(p.id, presence);
}

type Tally = { files: number; identical: number; structured: number; fallback: number; mismatches: string[] };
const tally = (): Tally => ({ files: 0, identical: 0, structured: 0, fallback: 0, mismatches: [] });
const check = (t: Tally, label: string, text: string, presence: Presence) => {
  t.files++;
  const parsed = parseDraft(text, presence);
  if (parsed.fallback) t.fallback++;
  else t.structured++;
  if (serialiseDraft(parsed) === text) t.identical++;
  else t.mismatches.push(label);
};

let failed = 0;
const total = tally();

// ─── Saved eval drafts ────────────────────────────────────────────────────────
const dirs = readdirSync("tmp").filter((d) => d.startsWith("summaries")).map((d) => join("tmp", d)).sort();
for (const dir of dirs) {
  const files = readdirSync(dir).filter((f) => /\.(en|te|hi|ta|kn|ml)\.md$/.test(f));
  if (!files.length) {
    console.log(`${dir}: no drafts`);
    continue;
  }
  const version = existsSync(join(dir, "results.json")) ? (JSON.parse(readFileSync(join(dir, "results.json"), "utf8")).prompt_version as string) : "?";
  const before = ["v1", "v2", "v3"].includes(version);
  const t = tally();
  for (const f of files) {
    const caseCode = f.split(".")[0];
    const now = presenceByCase.get(caseCode);
    if (!now) throw new Error(`${dir}/${f}: no record for ${caseCode}`);
    const presence = before && RED_FLAGS_ADDED_AFTER_V3.has(caseCode) ? { ...now, urgent: false } : now;
    check(t, `${dir}/${f}`, readFileSync(join(dir, f), "utf8"), presence);
  }
  console.log(`${dir} (prompt ${version}): ${t.files} drafts, ${t.identical} byte-identical, ${t.structured} structured, ${t.fallback} fallback${t.mismatches.length ? `, MISMATCH: ${t.mismatches.join(", ")}` : ""}`);
  failed += t.mismatches.length;
  Object.assign(total, { files: total.files + t.files, identical: total.identical + t.identical, structured: total.structured + t.structured, fallback: total.fallback + t.fallback });
}

// ─── Database rows (draft_text and approved_text) ─────────────────────────────
const { data: rows, error: rowsError } = await db.from("discharge_summaries").select("id, procedure_id, draft_text, approved_text");
if (rowsError) throw new Error(`Could not read discharge_summaries: ${rowsError.code}`);
const dbt = tally();
for (const r of rows ?? []) {
  const presence = presenceById.get(r.procedure_id);
  if (!presence) continue;
  check(dbt, `row ${r.id} draft_text`, r.draft_text, presence);
  if (r.approved_text !== null) check(dbt, `row ${r.id} approved_text`, r.approved_text, presence);
}
console.log(`database ${new URL(url).host}: ${rows?.length ?? 0} rows, ${dbt.files} texts, ${dbt.identical} byte-identical, ${dbt.structured} structured, ${dbt.fallback} fallback${dbt.mismatches.length ? `, MISMATCH: ${dbt.mismatches.join(", ")}` : ""}`);
failed += dbt.mismatches.length;

console.log(`\nTotal: ${total.files + dbt.files} texts, ${total.identical + dbt.identical} byte-identical, ${failed} mismatches.`);
process.exit(failed ? 1 : 0);
