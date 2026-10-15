/**
 * Week 4 eval (spec §9): every seeded discharged case × en/te/hi/ta/kn/ml, generated once, audited.
 *
 *   npm run summary:eval                 # estimate only: counts input tokens (free), prints cost, stops
 *   npm run summary:eval -- --confirm    # generates — THIS COSTS REAL MONEY
 *   npm run summary:eval -- --confirm --only PCI-2026-001 --lang te   # a subset
 *
 * Reads the database read-only (seeded = created_by is null, reviewed, discharged). Stores nothing
 * in the database. Writes tmp/summaries/<case>.<lang>.md, tmp/summaries/results.json and
 * tmp/summaries/report.md (gitignored). Prints case codes, languages, flag codes and token counts —
 * never the input or the draft text.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadProcedureForFhir } from "../lib/fhir/load.ts";
import { buildSummaryInput, inputHash, type SummaryInput } from "../lib/summary/input.ts";
import { buildMessages, LANGUAGES, PROMPT_VERSION, SUMMARY_MODEL, type SummaryLanguage } from "../lib/summary/prompt.ts";
import { createModelCall, draftSummary, MAX_TOKENS, SummaryModelError } from "../lib/summary/generate.ts";
import type { AuditFlag } from "../lib/summary/audit.ts";

const OUT = "tmp/summaries";
// claude-sonnet-5-5, per million tokens (platform.claude.com/docs/en/models/overview, 2026-10-15).
const PRICE = { in: 2, out: 10 };
const CONCURRENCY = 3;

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const argOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const only = argOf("--only");
const langs = (argOf("--lang")?.split(",") ?? Object.keys(LANGUAGES)) as SummaryLanguage[];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (an empty value in the shell also hides .env.local).");

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: rows, error } = await db
  .from("procedures")
  .select("id, case_code")
  .eq("status", "reviewed")
  .is("created_by", null)
  .order("case_code");
if (error) throw new Error(`Could not list procedures: ${error.code}`);

type Job = { case_code: string; language: SummaryLanguage; input: SummaryInput };
const jobs: Job[] = [];
for (const r of rows ?? []) {
  if (only && r.case_code !== only) continue;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { procedure } = await loadProcedureForFhir(db as any, r.id);
  if (!procedure?.discharge) continue;
  const input = buildSummaryInput(procedure);
  for (const language of langs) jobs.push({ case_code: r.case_code, language, input });
}
const cases = new Set(jobs.map((j) => j.case_code)).size;
console.log(`${cases} discharged seeded cases × ${langs.length} languages = ${jobs.length} summaries (model ${SUMMARY_MODEL}, prompt ${PROMPT_VERSION}).`);

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const dollars = (tin: number, tout: number) => (tin * PRICE.in + tout * PRICE.out) / 1e6;

// ─── Estimate (free: the token-counting endpoint does not generate) ───────────

if (!confirm) {
  const client = new Anthropic();
  const counts = await pool(jobs, 4, async (j) => {
    const { system, messages } = buildMessages(j.input, j.language);
    const r = await client.messages.countTokens({ model: SUMMARY_MODEL, system, messages, thinking: { type: "between_tools" } });
    return r.input_tokens;
  });
  const tin = counts.reduce((a, b) => a + b, 0);
  // Output: English drafts run ~600–800 tokens; Indic scripts take several times more tokens per
  // word, so the honest upper bound is max_tokens on every call.
  const outTypical = jobs.reduce((a, j) => a + (j.language === "en" ? 800 : 1300), 0);
  const outMax = jobs.length * MAX_TOKENS;
  console.log(`Input tokens (counted): ${tin.toLocaleString()} — ${Math.round(tin / jobs.length)} per summary.`);
  console.log(`Output tokens: ~${outTypical.toLocaleString()} expected, ${outMax.toLocaleString()} at most (max_tokens ${MAX_TOKENS} × ${jobs.length}).`);
  console.log(`Estimated cost: ~$${dollars(tin, outTypical).toFixed(2)} expected, $${dollars(tin, outMax).toFixed(2)} at most.`);
  console.log(`Nothing generated. To run: npm run summary:eval -- --confirm`);
  process.exit(0);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

type Result = {
  case_code: string; language: SummaryLanguage; ok: boolean; failure?: string; model?: string;
  tokens_in: number; tokens_out: number; latency_ms: number; flags: AuditFlag[]; input_hash: string;
};

mkdirSync(OUT, { recursive: true });
const call = createModelCall();
let consecutiveFailures = 0;
let stopped = false;

const results = await pool(jobs, CONCURRENCY, async (j, i): Promise<Result> => {
  const base = { case_code: j.case_code, language: j.language, input_hash: inputHash(j.input) };
  if (stopped) return { ...base, ok: false, failure: "not run (stopped after repeated failures)", tokens_in: 0, tokens_out: 0, latency_ms: 0, flags: [] };
  const t0 = Date.now();
  try {
    const d = await draftSummary(j.input, j.language, call);
    consecutiveFailures = 0;
    writeFileSync(join(OUT, `${j.case_code}.${j.language}.md`), d.draft_text + "\n");
    const codes = d.audit_flags.map((f) => f.code).join(",") || "clean";
    console.log(`[${i + 1}/${jobs.length}] ${j.case_code} ${j.language} ${d.tokens_in}/${d.tokens_out} tok ${codes}`);
    return { ...base, ok: true, model: d.model, tokens_in: d.tokens_in, tokens_out: d.tokens_out, latency_ms: Date.now() - t0, flags: d.audit_flags };
  } catch (e) {
    const failure = e instanceof SummaryModelError ? `${e.kind}: ${e.message}` : "failed";
    const billed = e instanceof SummaryModelError && e.billed ? e.billed : { tokens_in: 0, tokens_out: 0 };
    console.log(`[${i + 1}/${jobs.length}] ${j.case_code} ${j.language} FAILED ${failure} (${billed.tokens_in}/${billed.tokens_out} tok billed)`);
    if (++consecutiveFailures >= 3) stopped = true;
    return { ...base, ok: false, failure, ...billed, latency_ms: Date.now() - t0, flags: [] };
  }
});

writeFileSync(join(OUT, "results.json"), JSON.stringify({ model: SUMMARY_MODEL, prompt_version: PROMPT_VERSION, at: new Date().toISOString(), results }, null, 2));

// ─── Report ───────────────────────────────────────────────────────────────────

const ok = results.filter((r) => r.ok);
// Every billed token, including calls refused here (cut off at max_tokens, empty, declined).
const tin = results.reduce((a, r) => a + r.tokens_in, 0);
const tout = results.reduce((a, r) => a + r.tokens_out, 0);
const okIn = ok.reduce((a, r) => a + r.tokens_in, 0);
const okOut = ok.reduce((a, r) => a + r.tokens_out, 0);
const codesOf = (r: Result) => (!r.ok ? "FAILED" : r.flags.length ? r.flags.map((f) => (f.severity === "error" ? `**${f.code}**` : f.code)).join(", ") : "—");
const allCodes = [...new Set(ok.flatMap((r) => r.flags.map((f) => f.code)))].sort();

const lines: string[] = [];
lines.push(`# Summary eval — ${SUMMARY_MODEL}, prompt ${PROMPT_VERSION}`, "");
lines.push(`Run ${new Date().toISOString()}. ${jobs.length} scheduled, ${ok.length} generated, ${results.filter((r) => !r.ok).length} failed or not run.`);
const models = [...new Set(ok.map((r) => r.model))];
lines.push(`Models that answered: ${models.join(", ") || "none"}.`, "");
lines.push(`Billed tokens (all calls, including refused/cut off): ${tin.toLocaleString()} in, ${tout.toLocaleString()} out — $${dollars(tin, tout).toFixed(2)}.`);
lines.push(`Per generated summary: $${ok.length ? (dollars(okIn, okOut) / ok.length).toFixed(4) : "0"} (generated drafts only); all-in per usable summary $${ok.length ? (dollars(tin, tout) / ok.length).toFixed(4) : "0"}.`, "");
lines.push("## Per language", "", "| Language | Generated | Avg tokens in | Avg tokens out | Max out | Avg $ | With an error flag |", "|---|---|---|---|---|---|---|");
for (const l of langs) {
  const rs = ok.filter((r) => r.language === l);
  if (!rs.length) { lines.push(`| ${LANGUAGES[l]} | 0 | | | | | |`); continue; }
  const ai = rs.reduce((a, r) => a + r.tokens_in, 0) / rs.length;
  const ao = rs.reduce((a, r) => a + r.tokens_out, 0) / rs.length;
  const mx = Math.max(...rs.map((r) => r.tokens_out));
  const err = rs.filter((r) => r.flags.some((f) => f.severity === "error")).length;
  lines.push(`| ${LANGUAGES[l]} | ${rs.length} | ${Math.round(ai)} | ${Math.round(ao)} | ${mx} | ${dollars(ai, ao).toFixed(4)} | ${err} |`);
}
lines.push("", "## Flag counts", "", "| Flag | " + langs.join(" | ") + " | Total |", "|---|" + langs.map(() => "---").join("|") + "|---|");
for (const c of allCodes) {
  const per = langs.map((l) => ok.filter((r) => r.language === l && r.flags.some((f) => f.code === c)).length);
  lines.push(`| ${c} | ${per.join(" | ")} | ${per.reduce((a, b) => a + b, 0)} |`);
}
if (!allCodes.length) lines.push("| (none) |" + langs.map(() => " |").join("") + " |");
lines.push("", "## Flags per case (errors in bold)", "", "| Case | " + langs.join(" | ") + " |", "|---|" + langs.map(() => "---").join("|") + "|");
for (const c of [...new Set(results.map((r) => r.case_code))]) {
  lines.push(`| ${c} | ` + langs.map((l) => { const r = results.find((x) => x.case_code === c && x.language === l); return r ? codesOf(r) : ""; }).join(" | ") + " |");
}
lines.push("", "## Flag details", "");
for (const r of results) {
  if (!r.ok) { lines.push(`- ${r.case_code} ${r.language}: ${r.failure}`); continue; }
  for (const f of r.flags) lines.push(`- ${r.case_code} ${r.language} — ${f.severity} ${f.code}: ${f.detail}`);
}
writeFileSync(join(OUT, "report.md"), lines.join("\n") + "\n");
console.log(`\n${ok.length}/${jobs.length} generated. ${tin} in / ${tout} out = $${dollars(tin, tout).toFixed(2)}. Report: ${OUT}/report.md`);
