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
  | "physiology_missing"
  | "decision_mismatch"
  | "decision_unclear"
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

/**
 * Week 7: a deferred lesion must be described as not treated. English wording is checked strictly
 * (error); for the Indian languages, the sentence must carry a negation (warning — negation is
 * often a verb suffix, so a substring check can miss a correct sentence; the native reader decides).
 */
const DEFER_EN = /\bnot\b|\bno (stent|balloon)|\bwithout\b|n't\b/i;
const TREAT_CONTRADICTION_EN = /\bdefer|\bnot (stented|treated)\b|\bno stent was\b|\b(did not|didn't|does not|doesn't) need\b/i;
const NEGATION: Partial<Record<SummaryLanguage, string[]>> = {
  hi: ["नहीं", "बिना"],
  te: ["లేదు", "లేక", "లేని", "లేనం", "కుండా", "వద్దు"],
  ta: ["இல்ல", "ில்லை", "தவிர்"],
  kn: ["ಇಲ್ಲ", "ಿಲ್ಲ"],
  ml: ["ഇല്ല", "ില്ല", "ാതെ"],
};

/** Sentences: split at . ! ? । followed by space, and at line breaks; "0.86" stays whole. */
const sentences = (text: string) => text.split(/(?<=[.!?।])\s+|\n+/).filter((x) => x.trim());
const numbersIn = (text: string) => [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

const FORBIDDEN = ["not recorded", "unknown", "n/a", "as an ai", "i cannot"];
/**
 * v7 (owner, 2026-10-18): never in a patient summary — an error, unless the record's own text
 * contains the phrase. Checked as written in English, which is also how a medical term in
 * brackets appears in the other languages.
 */
const FORBIDDEN_CLINICAL = ["heart failure", "weak heart", "damaged"];
/**
 * v8 (owner, 2026-10-18): never in a patient summary, whatever the record holds — an error in every
 * language. "Fr" is matched as a word ("5 Fr", "6Fr"), not inside "From" or "Friday".
 */
const FORBIDDEN_STRICT: [string, RegExp][] = [
  ["Fr", /(?<![A-Za-z])Fr(?![a-z])/],
  ["French", /french/i],
  ["defer", /defer/i],
  ["decision was to", /decision (was|is) to/i],
];
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

  // physiology_missing / decision_mismatch / decision_unclear — Week 7: every physiology result
  // with a decision is given (test name and value), and the wording around it matches the decision.
  const lines = sentences(withoutNumbering(draft));
  for (const f of input.findings) {
    for (const ph of f.physiology ?? []) {
      if (!ph.decision) continue;
      const at = lines.findIndex((l) => l.includes(ph.test) && numbersIn(l).includes(ph.value));
      if (at < 0) {
        flags.push({ code: "physiology_missing", severity: "error", detail: `${f.vessel}: ${ph.test} ${ph.value} is not in the draft` });
        continue;
      }
      if (language === "en") {
        if (ph.decision === "defer" && !DEFER_EN.test(lines.slice(at, at + 3).join(" "))) {
          flags.push({ code: "decision_mismatch", severity: "error", detail: `${f.vessel}: ${ph.test} ${ph.value} was deferred, but the draft does not say it was not treated` });
        }
        if (ph.decision === "treat" && TREAT_CONTRADICTION_EN.test(lines.slice(at, at + 2).join(" "))) {
          flags.push({ code: "decision_mismatch", severity: "error", detail: `${f.vessel}: ${ph.test} ${ph.value} was treated, but the draft says it was not` });
        }
      } else if (ph.decision === "defer") {
        const window = lines.slice(at, at + 3).join(" ");
        if (!(NEGATION[language] ?? []).some((w) => window.includes(w))) {
          flags.push({ code: "decision_unclear", severity: "warning", detail: `${f.vessel}: ${ph.test} ${ph.value} was deferred — check the draft says it was not treated` });
        }
      }
    }
  }

  // section_missing / section_extra — the prompt's 9 sections, less those the record leaves empty:
  // "Your heart pump" needs an LVEF, "Looking after yourself" advice, "When to come back" red flags.
  // (Spec §5.2 said a flat 8/9; the first eval run showed the model rightly omitting the red-flag
  // section for the 11 seeded cases that record none, so the count follows the record.)
  const expected =
    9 -
    (input.measurements.lvef_pct === undefined ? 1 : 0) -
    (input.discharge?.advice.length ? 0 : 1) -
    (input.discharge?.red_flags.length ? 0 : 1);
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
  const inputText = JSON.stringify(input).toLowerCase();
  for (const phrase of FORBIDDEN_CLINICAL) {
    if (lower.includes(phrase) && !inputText.includes(phrase)) {
      flags.push({ code: "forbidden_phrase", severity: "error", detail: `contains "${phrase}"` });
    }
  }
  for (const [label, re] of FORBIDDEN_STRICT) {
    if (re.test(draft)) flags.push({ code: "forbidden_phrase", severity: "error", detail: `contains "${label}"` });
  }

  // too_long
  const words = draft.trim().split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) flags.push({ code: "too_long", severity: "warning", detail: `${words} words (limit ${MAX_WORDS})` });

  return flags;
}

export const hasErrors = (flags: AuditFlag[]) => flags.some((f) => f.severity === "error");
