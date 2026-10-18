/**
 * Regenerates a stale draft discharge summary with the current prompt, through the same code as the
 * Generate button (draftSummary → saveDraft): a new version is stored; older versions stay as history.
 *
 *   node --env-file=.env.local scripts/summary-regenerate.ts --case PCI-2026-005 --lang te --confirm
 *
 * THIS COSTS MONEY (one model call per run). Refuses unless the latest summary for that language is
 * an unapproved draft whose record has changed since it was generated — it never replaces an
 * approved summary or a current draft. No signed-in user: generated_by stays null, as on seeded rows.
 * Prints the case code, language, version, flag codes and tokens only — never the input or the text.
 */
import { createClient } from "@supabase/supabase-js";
import { loadProcedureForFhir } from "../lib/fhir/load.ts";
import { buildSummaryInput, inputHash, inputHashFor } from "../lib/summary/input.ts";
import { isSummaryLanguage, PROMPT_VERSION } from "../lib/summary/prompt.ts";
import { createModelCall, draftSummary, saveDraft } from "../lib/summary/generate.ts";
import { summaryBlocker } from "../lib/summary/api.ts";

const args = process.argv.slice(2);
const argOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const caseCode = argOf("--case");
const language = argOf("--lang");
if (!caseCode || !isSummaryLanguage(language)) throw new Error("Usage: --case <case code> --lang <en|te|hi|ta|kn|ml> --confirm");
if (!args.includes("--confirm")) throw new Error("This makes one paid model call. Add --confirm.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (an empty value in the shell also hides .env.local).");

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: row } = await db.from("procedures").select("id").eq("case_code", caseCode).single();
if (!row) throw new Error(`${caseCode} not found.`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { procedure: p } = await loadProcedureForFhir(db as any, row.id);
if (!p) throw new Error(`${caseCode} could not be loaded.`);
const blocker = summaryBlocker(p);
if (blocker) throw new Error(`${caseCode}: ${blocker}`);

const { data: latest } = await db
  .from("discharge_summaries")
  .select("version, status, prompt_version, input_hash")
  .eq("procedure_id", p.id)
  .eq("language", language)
  .order("version", { ascending: false })
  .limit(1)
  .maybeSingle();
if (!latest) throw new Error(`${caseCode} ${language}: no summary to regenerate.`);
if (latest.status === "approved") throw new Error(`${caseCode} ${language} v${latest.version} is approved — refusing.`);
if (latest.input_hash === inputHashFor(p, latest.prompt_version)) throw new Error(`${caseCode} ${language} v${latest.version} is current — nothing stale.`);

const input = buildSummaryInput(p);
const draft = await draftSummary(input, language, createModelCall());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saved = await saveDraft(db as any, { procedure_id: p.id, language, input_hash: inputHash(input), prompt_version: PROMPT_VERSION, ...draft });
if (saved.error || !saved.row) throw new Error(`save failed: ${saved.error?.code ?? "no row"}`);

const cost = (draft.tokens_in * 2 + draft.tokens_out * 10) / 1e6;
const flags = draft.audit_flags.map((f) => `${f.severity}:${f.code}`).join(", ") || "none";
console.log(`${caseCode} ${language}: v${latest.version} (${latest.prompt_version}, record changed) → v${saved.row.version} (${PROMPT_VERSION}), model ${draft.model}`);
console.log(`  flags: ${flags}; tokens ${draft.tokens_in}/${draft.tokens_out}; $${cost.toFixed(4)}`);
