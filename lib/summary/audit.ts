/**
 * Deterministic audit of a draft against its input (Week 4 spec §5.2). Pure: never edits the text,
 * only reports flags. An `error` flag blocks approval until the text is edited and re-audits clean.
 */
import type { SummaryInput } from "./input.ts";
import type { SummaryLanguage } from "./prompt.ts";
import { CARDIOLOGY_DRUGS } from "./drug-list.ts";

export type AuditCode =
  | "drug_missing"
  | "drug_extra"
  | "number_unknown"
  | "dose_mismatch"
  | "section_missing"
  | "section_extra"
  | "script_check"
  | "forbidden_phrase"
  | "too_long";

export type AuditFlag = { code: AuditCode; severity: "error" | "warning"; detail: string };

/** Unicode blocks expected for each Indian language (spec §5.2). */
export const SCRIPT_RANGES: Partial<Record<SummaryLanguage, [number, number, string]>> = {
  te: [0x0c00, 0x0c7f, "Telugu"],
  hi: [0x0900, 0x097f, "Devanagari"],
  ta: [0x0b80, 0x0bff, "Tamil"],
  kn: [0x0c80, 0x0cff, "Kannada"],
  ml: [0x0d00, 0x0d7f, "Malayalam"],
};

const FORBIDDEN = ["not recorded", "unknown", "n/a", "as an ai", "i cannot"];
const MAX_WORDS = 700;
const SCRIPT_THRESHOLD = 0.7;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every number that appears anywhere in the input — values, and digit groups inside strings (dates, sizes, case code). */
function inputNumbers(input: SummaryInput): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number") out.add(v);
    else if (typeof v === "string") for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) out.add(Number(m[0]));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(input);
  return out;
}

/** The draft without heading/list numbering, which is structure rather than content. */
function withoutNumbering(draft: string) {
  return draft
    .split("\n")
    .map((l) => l.replace(/^(\s*#{1,6}\s*)\d+[.)]\s*/, "$1").replace(/^\s*\d+[.)]\s+/, ""))
    .join("\n");
}

export function auditDraft(input: SummaryInput, draft: string, language: SummaryLanguage): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const lower = draft.toLowerCase();
  const meds = input.medications;

  // drug_missing — every discharge medication must appear (case-insensitive substring).
  const missing = new Set<string>();
  for (const m of meds) {
    if (!lower.includes(m.drug_name.toLowerCase())) {
      missing.add(m.drug_name);
      flags.push({ code: "drug_missing", severity: "error", detail: `${m.drug_name} is not in the draft` });
    }
  }

  // drug_extra — a known drug in the draft that no input medication contains.
  const inputDrugs = meds.map((m) => m.drug_name.toLowerCase());
  for (const drug of CARDIOLOGY_DRUGS) {
    if (!new RegExp(`(^|[^a-z])${escapeRe(drug)}([^a-z]|$)`, "i").test(draft)) continue;
    if (inputDrugs.some((d) => d.includes(drug))) continue;
    flags.push({ code: "drug_extra", severity: "error", detail: `${drug} appears in the draft but is not a discharge medication` });
  }

  // number_unknown — every number in the draft must exist somewhere in the input.
  const known = inputNumbers(input);
  const body = withoutNumbering(draft);
  const unknown = new Set<string>();
  for (const m of body.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!known.has(Number(m[0]))) unknown.add(m[0]);
  }
  // Digits in another script break the "Western digits" rule and cannot be checked — flag them too.
  for (const m of body.matchAll(/(?![0-9])\p{Nd}+/gu)) unknown.add(m[0]);
  for (const n of unknown) flags.push({ code: "number_unknown", severity: "error", detail: `${n} does not appear in the record` });

  // dose_mismatch — "<drug> … <dose> <unit>" within 60 characters, for every medication with a dose.
  for (const m of meds) {
    if (m.dose === undefined || missing.has(m.drug_name)) continue;
    const pattern = new RegExp(
      `${escapeRe(m.drug_name)}[\\s\\S]{0,60}?(?<![\\d.])${escapeRe(String(m.dose))}\\s*${escapeRe(m.unit ?? "")}`,
      "i",
    );
    if (!pattern.test(draft)) {
      flags.push({ code: "dose_mismatch", severity: "error", detail: `${m.drug_name} is not followed by ${m.dose} ${m.unit ?? ""}`.trim() });
    }
  }

  // section_missing / section_extra — 8 "##" headings, 9 when LVEF is present.
  const expected = input.measurements.lvef_pct !== undefined ? 9 : 8;
  const headings = draft.split("\n").filter((l) => /^##\s+\S/.test(l)).length;
  if (headings < expected) flags.push({ code: "section_missing", severity: "warning", detail: `${headings} sections, expected ${expected}` });
  if (headings > expected) flags.push({ code: "section_extra", severity: "warning", detail: `${headings} sections, expected ${expected}` });

  // script_check — Indian languages: ≥ 70 % of non-Latin letters in the expected block,
  // ignoring the medicines table and Latin-script tokens (drug names, abbreviations).
  const range = SCRIPT_RANGES[language];
  if (range) {
    const [lo, hi, name] = range;
    const text = draft.split("\n").filter((l) => !l.trimStart().startsWith("|")).join("\n");
    const letters = [...text.matchAll(/[\p{L}\p{M}]/gu)].map((m) => m[0]).filter((c) => !/[A-Za-z]/.test(c));
    const inBlock = letters.filter((c) => {
      const cp = c.codePointAt(0)!;
      return cp >= lo && cp <= hi;
    }).length;
    const share = letters.length ? inBlock / letters.length : 0;
    if (share < SCRIPT_THRESHOLD) {
      flags.push({ code: "script_check", severity: "warning", detail: `${Math.round(share * 100)}% of the text is in ${name} script (expected at least 70%)` });
    }
  }

  // forbidden_phrase
  for (const phrase of FORBIDDEN) {
    if (lower.includes(phrase)) flags.push({ code: "forbidden_phrase", severity: "warning", detail: `contains "${phrase}"` });
  }

  // too_long
  const words = draft.trim().split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) flags.push({ code: "too_long", severity: "warning", detail: `${words} words (limit ${MAX_WORDS})` });

  return flags;
}

export const hasErrors = (flags: AuditFlag[]) => flags.some((f) => f.severity === "error");
