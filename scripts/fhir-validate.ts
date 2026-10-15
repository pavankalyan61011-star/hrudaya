/**
 * Exports every reviewed procedure as a FHIR document Bundle and validates them with the official
 * HL7 FHIR validator (spec §5).
 *
 *   npm run fhir:validate
 *
 * Needs Java 17+ (Homebrew openjdk@17 is used if present; else $JAVA_BIN or `java`) and
 * tools/validator_cli.jar (HL7 validator 7.0.1 — see docs/fhir-mapping.md for setup).
 * Writes tmp/fhir/<case_code>.json, tmp/fhir/validator-output.json and tmp/fhir/report.md.
 * Exits 1 if any case has an error. Prints case codes and validator messages only.
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OperationOutcome } from "fhir/r4";
import { loadProcedureForFhir } from "../lib/fhir/load.ts";
import { procedureToBundle } from "../lib/fhir/mapper.ts";

const OUT = "tmp/fhir";
const JAR = "tools/validator_cli.jar";
const JAVA = process.env.JAVA_BIN ?? (existsSync("/opt/homebrew/opt/openjdk@17/bin/java") ? "/opt/homebrew/opt/openjdk@17/bin/java" : "java");

// Hrudaya's own extensions have no published StructureDefinitions yet; allow them by domain.
const VALIDATOR_ARGS = ["-version", "4.0.1", "-extension", "https://hrudaya.dev"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!existsSync(JAR)) {
  console.error(`Missing ${JAR}. See docs/fhir-mapping.md → Validation.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// ─── Export ────────────────────────────────────────────────────────────────────

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: rows, error } = await db.from("procedures").select("id, case_code").eq("status", "reviewed").order("case_code");
if (error || !rows) {
  console.error(`Could not list procedures: ${error?.code ?? "?"}`);
  process.exit(1);
}

const now = new Date().toISOString();
const files: { code: string; path: string }[] = [];
for (const r of rows) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { procedure, error: loadError } = await loadProcedureForFhir(db as any, r.id);
  if (loadError || !procedure) {
    console.error(`${r.case_code}: could not load (${(loadError as { code?: string } | null)?.code ?? "not found"})`);
    process.exit(1);
  }
  const path = join(OUT, `${r.case_code}.json`);
  writeFileSync(path, JSON.stringify(procedureToBundle(procedure, now), null, 2));
  files.push({ code: r.case_code, path });
}
console.log(`Exported ${files.length} reviewed procedures to ${OUT}/`);

// ─── Validate (one JVM run for all files) ──────────────────────────────────────

const outputPath = join(OUT, "validator-output.json");
console.log(`Validating with ${JAR} (${JAVA}) — the first run downloads the R4 core package…`);
try {
  execFileSync(JAVA, ["-jar", JAR, ...files.map((f) => f.path), ...VALIDATOR_ARGS, "-output", outputPath], {
    stdio: ["ignore", "ignore", "inherit"],
    maxBuffer: 1 << 28,
  });
} catch {
  // The validator exits non-zero when it finds errors; the output file is still written.
}
if (!existsSync(outputPath)) {
  console.error("The validator produced no output file.");
  process.exit(1);
}

// ─── Report ────────────────────────────────────────────────────────────────────

type Issue = { severity: string; message: string; location: string };
const raw = JSON.parse(readFileSync(outputPath, "utf8")) as OperationOutcome | { resourceType: "Bundle"; entry?: { resource: OperationOutcome }[] };
const outcomes: OperationOutcome[] = raw.resourceType === "Bundle" ? (raw.entry ?? []).map((e) => e.resource) : [raw];

const fileOf = (o: OperationOutcome) =>
  (o.extension?.find((e) => e.url.endsWith("operationoutcome-file"))?.valueString ?? "").split("/").pop()?.replace(/\.json$/, "") ?? "?";

const byCase = new Map<string, Issue[]>();
for (const o of outcomes) {
  const issues: Issue[] = (o.issue ?? [])
    .filter((i) => !(i.severity === "information" && /All OK/i.test(i.diagnostics ?? i.details?.text ?? "")))
    .map((i) => ({
      severity: i.severity,
      message: i.details?.text ?? i.diagnostics ?? "(no message)",
      location: (i.expression ?? i.location ?? [])[0] ?? "",
    }));
  byCase.set(fileOf(o), issues);
}

const count = (issues: Issue[], sev: string[]) => issues.filter((i) => sev.includes(i.severity)).length;
const lines = ["# FHIR validation report", "", `Validator: HL7 FHIR validator 7.0.1 (${VALIDATOR_ARGS.join(" ")}) · exported ${now}`, ""];
lines.push("| Case | Errors | Warnings | Information |", "|---|---|---|---|");
let totalErrors = 0;
for (const f of files) {
  const issues = byCase.get(f.code) ?? [];
  const e = count(issues, ["error", "fatal"]);
  totalErrors += e;
  lines.push(`| ${f.code} | ${e} | ${count(issues, ["warning"])} | ${count(issues, ["information"])} |`);
}

// Distinct messages across all cases, with how many cases each appears in.
const distinct = new Map<string, { severity: string; cases: Set<string>; location: string }>();
for (const [code, issues] of byCase) {
  for (const i of issues) {
    const k = `${i.severity}|${i.message}`;
    if (!distinct.has(k)) distinct.set(k, { severity: i.severity, cases: new Set(), location: i.location });
    distinct.get(k)!.cases.add(code);
  }
}
const order = ["fatal", "error", "warning", "information"];
lines.push("", "## Distinct messages", "");
for (const [k, v] of [...distinct.entries()].sort((a, b) => order.indexOf(a[1].severity) - order.indexOf(b[1].severity))) {
  lines.push(`- **${v.severity}** (${v.cases.size} case${v.cases.size === 1 ? "" : "s"}) — ${k.split("|").slice(1).join("|")}${v.location ? `  \n  _e.g. ${v.location}_` : ""}`);
}
writeFileSync(join(OUT, "report.md"), lines.join("\n") + "\n");

for (const f of files) {
  const issues = byCase.get(f.code) ?? [];
  console.log(`${f.code}  errors ${count(issues, ["error", "fatal"])}  warnings ${count(issues, ["warning"])}`);
}
console.log(`\n${files.length} cases, ${totalErrors} errors in total. Report: ${OUT}/report.md`);
if (totalErrors > 0) process.exit(1);
