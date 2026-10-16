"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SummaryLanguage } from "@/lib/summary/prompt";
import type { SummaryInput } from "@/lib/summary/input";
import { summaryFontFamily } from "@/lib/summary/fonts";
import {
  SECTION_KEYS, draftTableRows, editableText, medicinesAfterText, parseDraft, presenceFromInput, serialiseDraft, withSectionText,
  type DraftSection, type ParsedDraft, type SectionKey,
} from "@/lib/summary/sections";
import { locateFlags, type FlagPlace, type UiFlag } from "@/lib/summary/flag-locations";

/** What a section is for, in English — shown small above the model's own heading. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  why: "Why in hospital", done: "What was done", found: "What was found", pump: "Heart pump (LVEF)", medicines: "Medicines",
  care: "Looking after yourself", urgent: "When to come back urgently", followup: "Follow-up", team: "Team",
};
const ABSENT: Partial<Record<SectionKey, string>> = {
  pump: "Not in this leaflet — no LVEF recorded",
  care: "Not in this leaflet — no advice recorded",
  urgent: "Not in this leaflet — no red flags recorded",
};

type Props = {
  /** The text to start from (approved_text ?? draft_text). Read once when editing starts. */
  initialText: string;
  input: SummaryInput;
  language: SummaryLanguage;
  /** Live audit flags for the current text (computed by the card, debounced). */
  flags: UiFlag[];
  onChange: (markdown: string) => void;
  /** Called with the section a reviewer last focused — the Compare sheet opens there. */
  onFocusSection?: (key: SectionKey) => void;
  /** Rendered beside each section (the record group) — second column on wide screens. */
  aside?: (key: SectionKey) => React.ReactNode;
  /** Shown at the top of the second column (e.g. "Record changed since this draft"). */
  asideHeader?: React.ReactNode;
  disabled?: boolean;
};

/**
 * Structured editor (Week 5 spec §4). One block per section, headings read-only, medicines table
 * rendered from the record and never edited. Falls back to the single textarea when the draft
 * cannot be split by the record's sections. Emits the serialised Markdown on every change; the
 * card saves exactly that text, which is also what "View Markdown" shows.
 */
export function SummaryEditor({ initialText, input, language, flags, onChange, onFocusSection, aside, asideHeader, disabled }: Props) {
  const presence = useMemo(() => presenceFromInput(input), [input]);
  const [parsed, setParsed] = useState<ParsedDraft>(() => parseDraft(initialText, presence));
  const markdown = useMemo(() => serialiseDraft(parsed), [parsed]);
  const font = { fontFamily: summaryFontFamily(language) };

  const meds = useMemo(() => medicineRows(input, parsed), [input, parsed]);
  const placed = useMemo(() => locateFlags(parsed, [...flags, ...meds.flags]), [parsed, flags, meds.flags]);
  const errors = [...flags, ...meds.flags].filter((f) => f.severity === "error").length;
  const warnings = flags.length + meds.flags.length - errors;

  function edit(key: DraftSection["key"], text: string) {
    const next = withSectionText(parsed, key, text);
    setParsed(next);
    onChange(serialiseDraft(next));
  }

  const summaryLine = (
    <div
      id="live-audit"
      className={`rounded-lg border p-3 text-sm ${errors ? "border-red-300 bg-red-50 text-red-950" : "border-slate-200 bg-slate-50 text-slate-800"}`}
    >
      <p className="font-medium">
        {errors
          ? `Approve is disabled until ${errors === 1 ? "this error is" : `these ${errors} errors are`} fixed.`
          : warnings
            ? `No errors. ${warnings} ${warnings === 1 ? "warning" : "warnings"} to check.`
            : "Audit of this text: no flags."}
        {(errors || warnings) && !parsed.fallback ? " Each flag is shown beside its section." : ""}
      </p>
      <FlagList flags={placed.get("global") ?? []} />
    </div>
  );

  if (parsed.fallback) {
    return (
      <div className="space-y-3">
        {summaryLine}
        <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          This draft&apos;s sections do not match the record, so it is shown as plain text. Check it against the record, then approve as
          usual.
        </p>
        <div>
          <label htmlFor="summary-text" className="label">Summary text (Markdown)</label>
          <AutoTextarea id="summary-text" lang={language} style={font} value={parsed.sections[0].body} disabled={disabled}
            onChange={(v) => edit("unknown", v)} minRows={16} />
        </div>
        <MarkdownView markdown={markdown} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {summaryLine}
      <ol className="space-y-3">
        {aside && (
          <li className="hidden lg:grid lg:grid-cols-[3fr_2fr] lg:gap-4">
            <p className="self-end text-xs font-semibold uppercase tracking-wide text-slate-500">Draft · edit the wording</p>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Record · what the model saw</p>
              {asideHeader}
            </div>
          </li>
        )}
        {SECTION_KEYS.map((key) => {
          const s = parsed.sections.find((x) => x.key === key)!;
          const here = placed.get(key) ?? [];
          const tone = here.some((f) => f.severity === "error") ? "border-l-red-600" : here.length ? "border-l-amber-500" : "border-l-slate-200";
          const body = !s.present ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
              <span className="font-medium">{SECTION_LABEL[key]}:</span> {ABSENT[key] ?? "Not in this leaflet"}
            </p>
          ) : (
            <section className={`rounded-lg border border-l-4 border-slate-200 bg-white p-3 ${tone}`} aria-labelledby={`sec-${key}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{SECTION_LABEL[key]}</p>
              <h4 id={`sec-${key}`} lang={language} style={font} className="mb-2 break-words text-base font-bold text-slate-900">{s.heading}</h4>
              {key === "medicines" && <MedicinesTable rows={meds.rows} language={language} />}
              <label htmlFor={`text-${key}`} className="sr-only">{SECTION_LABEL[key]} text</label>
              <AutoTextarea
                id={`text-${key}`}
                lang={language}
                style={font}
                value={key === "medicines" ? medicinesAfterText(s) : editableText(s)}
                disabled={disabled}
                onChange={(v) => edit(key, v)}
                onFocus={() => onFocusSection?.(key)}
                minRows={2}
              />
              <FlagList flags={here} />
            </section>
          );
          return (
            <li key={key} data-section={key} className="lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-4">
              <div className="min-w-0">{body}</div>
              {aside && <div className="hidden min-w-0 lg:sticky lg:top-16 lg:block">{aside(key)}</div>}
            </li>
          );
        })}
      </ol>
      <MarkdownView markdown={markdown} />
    </div>
  );
}

// ─── Medicines: from the record, with the draft's wording for how often / how long ──

type MedRow = { drug: string; dose: string; often: string; long: string; dapt: boolean; unmatched?: boolean };

/** Record medicines, each with the frequency/duration cells the draft wrote for it (matched by drug name). */
export function medicineRows(input: SummaryInput, parsed: ParsedDraft): { rows: MedRow[]; flags: UiFlag[] } {
  const draftRows = draftTableRows(parsed.medicinesTable);
  const used = new Set<number>();
  const rows: MedRow[] = input.medications.map((m) => {
    const i = draftRows.findIndex((r, j) => !used.has(j) && (r.cells[0] ?? "").toLowerCase().includes(m.drug_name.toLowerCase()));
    if (i >= 0) used.add(i);
    const r = i >= 0 ? draftRows[i].cells : [];
    return {
      drug: m.drug_name,
      dose: m.dose !== undefined ? `${m.dose} ${m.unit ?? ""}`.trim() : "",
      often: r[2] ?? m.frequency,
      long: r[3] ?? m.duration ?? "",
      dapt: m.is_dapt,
    };
  });
  const flags: UiFlag[] = [];
  draftRows.forEach((r, j) => {
    if (used.has(j)) return;
    rows.push({ drug: r.cells[0] ?? "", dose: r.cells[1] ?? "", often: r.cells[2] ?? "", long: r.cells[3] ?? "", dapt: false, unmatched: true });
    flags.push({ code: "medicine_row_unmatched", severity: "warning", detail: `"${r.cells[0] ?? r.raw}" is in the draft's table but matches no medicine in the record` });
  });
  return { rows, flags };
}

function MedicinesTable({ rows, language }: { rows: MedRow[]; language: SummaryLanguage }) {
  const font = { fontFamily: summaryFontFamily(language) };
  return (
    <div className="mb-3 space-y-2">
      <table className="summary-table w-full text-left text-sm">
        <thead className="text-slate-600">
          <tr>
            {["Drug", "Dose", "How often", "For how long"].map((h) => (
              <th key={h} scope="col" className="border-b border-slate-300 py-1.5 pr-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-slate-100 align-top ${r.unmatched ? "bg-amber-50" : ""}`}>
              <td data-label="Drug" className="py-1.5 pr-2 font-medium">
                {r.drug}
                {r.dapt && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-900">DAPT</span>}
              </td>
              <td data-label="Dose" className="py-1.5 pr-2">{r.dose}</td>
              <td data-label="How often" lang={language} style={font} className="break-words py-1.5 pr-2">{r.often}</td>
              <td data-label="For how long" lang={language} style={font} className="break-words py-1.5 pr-2">{r.long}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-slate-600">Medicines come from the record. To change a dose, amend the procedure.</p>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

export function FlagList({ flags }: { flags: UiFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {flags.map((f, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${f.severity === "error" ? "bg-red-700 text-white" : "bg-amber-200 text-amber-950"}`}>
            {f.severity === "error" ? "Error" : "Warning"}
          </span>
          <span className="font-mono text-xs">{f.code}</span>
          <span className="min-w-0 break-words">{f.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <details className="group rounded-lg border border-slate-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
        <span aria-hidden className="inline-block text-slate-500 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90">›</span>
        View Markdown (exactly what will be saved)
      </summary>
      <pre data-testid="markdown-view" className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800">
        {markdown}
      </pre>
    </details>
  );
}

/** A textarea that grows with its content (16 px text, so phones do not zoom). */
function AutoTextarea(props: {
  id: string; lang: string; style: React.CSSProperties; value: string; disabled?: boolean; minRows: number;
  onChange: (v: string) => void; onFocus?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(resize, [props.value]);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return (
    <textarea
      ref={ref}
      id={props.id}
      lang={props.lang}
      style={props.style}
      rows={props.minRows}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
      onFocus={props.onFocus}
      className="input resize-none overflow-hidden text-base leading-relaxed"
    />
  );
}

export type { FlagPlace };
