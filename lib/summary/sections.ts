/**
 * Draft Markdown ⇄ sections (Week 5 spec §3). Pure, never throws, and lossless: for any text,
 * serialiseDraft(parseDraft(text, presence)) === text, byte for byte.
 *
 * The parser relies on structure, not heading text (headings are in the target language): the
 * n-th "## " heading maps to the n-th *present* section key, and which keys are present is decided
 * from the summary input — the same rule the audit uses for its section count:
 *   pump    present iff an LVEF value is in the input
 *   care    present iff advice is non-empty      (spec §3 names pump/urgent; the prompt and the
 *                                                  audit also omit an empty care section)
 *   urgent  present iff red flags are non-empty
 * If the heading count does not match, the whole text becomes one 'unknown' section and the UI
 * falls back to the single textarea.
 *
 * Exactness: a section's `raw` keeps every character after its heading line (blank lines
 * included), and the medicines table is cut out of the medicines body and re-inserted at the
 * same offset. Editing replaces only the trimmed text, keeping the original leading and trailing
 * whitespace, so an edited draft keeps the model's layout.
 *
 * Type-only imports plus relative `.ts` imports, so it runs under Node as well as in Next.
 */
import type { SummaryInput } from "./input.ts";

export const SECTION_KEYS = ["why", "done", "found", "pump", "medicines", "care", "urgent", "followup", "team"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type DraftSection = {
  key: SectionKey | "unknown";
  /** As the model wrote it, after "## ". Empty for 'unknown'. */
  heading: string;
  /** Markdown body excluding the medicines table (for 'medicines'); exact, whitespace included. */
  body: string;
  /** False when the prompt legitimately omitted the section (no LVEF / advice / red flags). */
  present: boolean;
  /** Medicines only: offset in `body` where the table is re-inserted. */
  tableAt?: number;
};
export type ParsedDraft = {
  sections: DraftSection[];
  medicinesTable: string | null;
  preamble: string;
  /** True when the heading count did not match the record: one 'unknown' section, plain editor. */
  fallback: boolean;
};

export type Presence = { pump: boolean; care: boolean; urgent: boolean };

export function presenceFromInput(input: Pick<SummaryInput, "measurements" | "discharge">): Presence {
  return {
    pump: input.measurements.lvef_pct !== undefined,
    care: (input.discharge?.advice.length ?? 0) > 0,
    urgent: (input.discharge?.red_flags.length ?? 0) > 0,
  };
}

export function presentKeys(p: Presence): SectionKey[] {
  return SECTION_KEYS.filter((k) => (k === "pump" ? p.pump : k === "care" ? p.care : k === "urgent" ? p.urgent : true));
}

/** Start offsets of every line that begins with "## " (exactly two #, then a space). */
function headingStarts(text: string): number[] {
  const starts: number[] = [];
  const re = /^## /gm;
  for (let m = re.exec(text); m; m = re.exec(text)) starts.push(m.index);
  return starts;
}

/** The first contiguous block of lines starting with "|" (the medicines table), with its newlines. */
function findTable(body: string): { at: number; table: string } | null {
  const lines = body.split(/(?<=\n)/); // keep each line's own "\n"
  let offset = 0;
  let start = -1;
  let end = -1;
  for (const line of lines) {
    const isRow = line.trimStart().startsWith("|");
    if (isRow && start < 0) start = offset;
    if (!isRow && start >= 0) {
      end = offset;
      break;
    }
    offset += line.length;
  }
  if (start < 0) return null;
  if (end < 0) end = body.length;
  return { at: start, table: body.slice(start, end) };
}

function fallbackDraft(text: string): ParsedDraft {
  return { sections: [{ key: "unknown", heading: "", body: text, present: true }], medicinesTable: null, preamble: "", fallback: true };
}

export function parseDraft(markdown: string, presence: Presence): ParsedDraft {
  const text = typeof markdown === "string" ? markdown : "";
  const starts = headingStarts(text);
  const keys = presentKeys(presence);
  if (starts.length === 0 || starts.length !== keys.length) return fallbackDraft(text);

  const preamble = text.slice(0, starts[0]);
  const sections: DraftSection[] = [];
  let medicinesTable: string | null = null;

  starts.forEach((start, i) => {
    const chunk = text.slice(start, i + 1 < starts.length ? starts[i + 1] : text.length);
    const nl = chunk.indexOf("\n");
    const heading = nl < 0 ? chunk.slice(3) : chunk.slice(3, nl);
    // Keep the newline after the heading inside the body so a heading at end-of-text round-trips.
    let body = nl < 0 ? "" : chunk.slice(nl);
    const key = keys[i];
    const section: DraftSection = { key, heading, body, present: true };
    if (key === "medicines") {
      const t = findTable(body);
      if (t) {
        medicinesTable = t.table;
        section.body = body = body.slice(0, t.at) + body.slice(t.at + t.table.length);
        section.tableAt = t.at;
      }
    }
    sections.push(section);
  });

  // Omitted sections are listed (present: false) so the editor can say why they are absent.
  const all: DraftSection[] = SECTION_KEYS.map((k) => sections.find((s) => s.key === k) ?? { key: k, heading: "", body: "", present: false });
  return { sections: all, medicinesTable, preamble, fallback: false };
}

export function serialiseDraft(parsed: ParsedDraft): string {
  if (parsed.fallback) return parsed.sections[0]?.body ?? "";
  let out = parsed.preamble;
  for (const s of parsed.sections) {
    if (!s.present) continue;
    let body = s.body;
    if (s.key === "medicines" && parsed.medicinesTable !== null && s.tableAt !== undefined) {
      body = body.slice(0, s.tableAt) + parsed.medicinesTable + body.slice(s.tableAt);
    }
    out += `## ${s.heading}` + body;
  }
  return out;
}

// ─── Editing helpers ──────────────────────────────────────────────────────────

/** The text a reviewer edits: the body without its surrounding blank lines. */
export function editableText(s: DraftSection): string {
  return s.body.trim();
}

/**
 * Replace a section's text, keeping the original leading/trailing whitespace. For medicines the
 * edited text is the part AFTER the table (the DAPT sentence and "do not stop…"); any text before
 * the table is kept as it was.
 */
export function withSectionText(parsed: ParsedDraft, key: DraftSection["key"], text: string): ParsedDraft {
  return {
    ...parsed,
    sections: parsed.sections.map((s) => {
      if (s.key !== key) return s;
      if (s.key === "medicines" && s.tableAt !== undefined) {
        const before = s.body.slice(0, s.tableAt);
        const after = s.body.slice(s.tableAt);
        return { ...s, body: before + reflow(after, text) };
      }
      return { ...s, body: reflow(s.body, text) };
    }),
  };
}

/** For medicines: the editable text after the table. */
export function medicinesAfterText(s: DraftSection): string {
  return s.tableAt === undefined ? s.body.trim() : s.body.slice(s.tableAt).trim();
}

function reflow(original: string, text: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  // A body that was only whitespace gets the prompt's layout: blank line, text, blank line.
  if (!original.trim()) return `\n\n${text.trim()}${original.endsWith("\n") ? "\n\n" : ""}`;
  return lead + text.trim() + trail;
}

// ─── The draft's medicines table ──────────────────────────────────────────────

export type DraftTableRow = { cells: string[]; raw: string };

/** Data rows of the draft's table (header and separator rows excluded). */
export function draftTableRows(table: string | null): DraftTableRow[] {
  if (!table) return [];
  const lines = table.split("\n").filter((l) => l.trim().startsWith("|"));
  const isSep = (l: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l.trim());
  const body = lines.length > 1 && isSep(lines[1]) ? lines.slice(2) : lines;
  return body.map((raw) => ({
    raw,
    cells: raw.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()),
  }));
}
