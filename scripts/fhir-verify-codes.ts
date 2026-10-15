/**
 * Re-verifies every `verified: true` SNOMED/LOINC entry in lib/fhir/codes.ts against tx.fhir.org:
 * the code must exist, be active, and our display must be one of its designations.
 *   npm run fhir:verify-codes
 * Prints codes only — no patient data is involved.
 */
import * as codes from "../lib/fhir/codes.ts";

type Entry = { system: string; code: string; display: string; verified: boolean };

function collect(): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const e = v as Entry;
    if (typeof e.system === "string" && typeof e.code === "string" && typeof e.verified === "boolean") {
      if (e.verified && (e.system === codes.SYSTEM.snomed || e.system === codes.SYSTEM.loinc)) out.set(`${e.system}|${e.code}|${e.display}`, e);
      return;
    }
    Object.values(v).forEach(visit);
  };
  visit({ ...codes });
  return out;
}

async function lookup(e: Entry) {
  const url = `https://tx.fhir.org/r4/CodeSystem/$lookup?system=${encodeURIComponent(e.system)}&code=${encodeURIComponent(e.code)}&property=designation&property=inactive`;
  const res = await fetch(url, { headers: { Accept: "application/fhir+json" } });
  const body = (await res.json()) as { resourceType: string; parameter?: { name: string; valueString?: string; valueBoolean?: boolean; part?: { name: string; valueString?: string }[] }[] };
  if (body.resourceType !== "Parameters") return { ok: false, why: "unknown code" };
  const names = new Set<string>();
  let inactive = false;
  for (const p of body.parameter ?? []) {
    if (p.name === "display" && p.valueString) names.add(p.valueString);
    if (p.name === "designation") for (const part of p.part ?? []) if (part.name === "value" && part.valueString) names.add(part.valueString);
    if (p.name === "property" && p.part?.some((x) => x.valueString === "inactive") && p.part?.some((x) => (x as { valueBoolean?: boolean }).valueBoolean)) inactive = true;
  }
  if (inactive) return { ok: false, why: "inactive" };
  if (!names.has(e.display)) return { ok: false, why: `display not a designation (has: ${[...names].slice(0, 3).join(" / ")})` };
  return { ok: true, why: "" };
}

const entries = [...collect().values()];
let bad = 0;
for (const e of entries) {
  const r = await lookup(e);
  if (!r.ok) bad++;
  console.log(`${r.ok ? "OK  " : "FAIL"} ${e.system === codes.SYSTEM.snomed ? "SNOMED" : "LOINC "} ${e.code.padEnd(10)} ${e.display}${r.ok ? "" : `  — ${r.why}`}`);
}
console.log(`\n${entries.length} verified codes checked against tx.fhir.org: ${entries.length - bad} OK, ${bad} failed.`);
if (bad > 0) process.exit(1);
