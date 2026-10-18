/**
 * Where each audit flag belongs in the draft (Week 5 spec §6). Pure; `auditDraft` is unchanged and
 * still runs on the whole Markdown — this only decides placement.
 *
 *   drug_missing, dose_mismatch, medicine_row_unmatched   → medicines
 *   section_missing, section_extra, too_long, script_check → global (under the banner, as today)
 *   physiology_missing, decision_mismatch, decision_unclear → found (Week 7)
 *   drug_extra, number_unknown, forbidden_phrase           → the first section, in document order,
 *       whose body (or, for medicines, the table) contains the quoted token; global if none does
 *   anything else, and everything when the draft fell back  → global
 *
 * The token is read from the flag's `detail`, whose wording `audit.ts` fixes. dose_mismatch goes
 * straight to medicines (spec §8: "a dose error lands on medicines") rather than to the first
 * mention of the drug, which could be the prose of an earlier section.
 */
import type { AuditCode, AuditFlag } from "./audit.ts";
import type { ParsedDraft, SectionKey } from "./sections.ts";

/** UI-only flag (spec §3): a draft medicines-table row that matches no medicine in the record. */
export type UiFlag = Omit<AuditFlag, "code"> & { code: AuditCode | "medicine_row_unmatched" };
export type FlagPlace = SectionKey | "global";

const TO_MEDICINES = new Set(["drug_missing", "dose_mismatch", "medicine_row_unmatched"]);
const TO_FOUND = new Set(["physiology_missing", "decision_mismatch", "decision_unclear"]);
const GLOBAL = new Set(["section_missing", "section_extra", "too_long", "script_check"]);

/** The token a flag quotes, from the fixed detail wording in audit.ts. */
export function flagToken(flag: UiFlag): string | null {
  switch (flag.code) {
    case "drug_extra":
      return flag.detail.match(/^(.+?) appears in the draft/)?.[1] ?? null;
    case "number_unknown":
      return flag.detail.match(/^(.+?) does not appear in the record/)?.[1] ?? null;
    case "forbidden_phrase":
      return flag.detail.match(/^contains "(.+)"$/)?.[1] ?? null;
    default:
      return null;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsToken(haystack: string, flag: UiFlag, token: string): boolean {
  if (flag.code === "number_unknown") {
    // A whole number: "5" must not match inside "15" or "5.5"; digits in any script.
    return new RegExp(`(?<![\\p{Nd}.])${escapeRe(token)}(?![\\p{Nd}]|\\.\\p{Nd})`, "u").test(haystack);
  }
  if (flag.code === "drug_extra") {
    return new RegExp(`(^|[^a-z])${escapeRe(token)}([^a-z]|$)`, "i").test(haystack);
  }
  return haystack.toLowerCase().includes(token.toLowerCase());
}

export function locateFlags(parsed: ParsedDraft, flags: UiFlag[]): Map<FlagPlace, UiFlag[]> {
  const out = new Map<FlagPlace, UiFlag[]>();
  const put = (place: FlagPlace, f: UiFlag) => out.set(place, [...(out.get(place) ?? []), f]);

  const present = parsed.fallback ? [] : parsed.sections.filter((s) => s.present);
  const textOf = (key: SectionKey): string => {
    const s = present.find((x) => x.key === key);
    if (!s) return "";
    return key === "medicines" ? `${s.body}\n${parsed.medicinesTable ?? ""}` : `${s.heading}\n${s.body}`;
  };

  for (const f of flags) {
    if (parsed.fallback || GLOBAL.has(f.code)) {
      put("global", f);
      continue;
    }
    if (TO_MEDICINES.has(f.code) && present.some((s) => s.key === "medicines")) {
      put("medicines", f);
      continue;
    }
    if (TO_FOUND.has(f.code) && present.some((s) => s.key === "found")) {
      put("found", f);
      continue;
    }
    const token = flagToken(f);
    const hit = token ? present.find((s) => s.key !== "unknown" && containsToken(textOf(s.key as SectionKey), f, token)) : undefined;
    put(hit ? (hit.key as SectionKey) : "global", f);
  }
  return out;
}
