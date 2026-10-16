"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LANGUAGES, type SummaryLanguage } from "@/lib/summary/prompt";
import { auditDraft, hasErrors, type AuditFlag } from "@/lib/summary/audit";
import type { SummaryInput } from "@/lib/summary/input";
import type { ClientSummary as SummaryRow } from "@/lib/summary/api";
import { AMENDING_BLOCKER } from "@/lib/summary/blocker";
import { SUMMARY_FONT_VARIABLES } from "@/lib/summary/fonts";
import { formatDateTime } from "@/lib/report-format";
import { SummaryMarkdown } from "./summary-markdown";
import { SummaryEditor } from "./summary-editor";
import { RecordBlock, RecordChanged, type RecordContext } from "./record-panel";
import { CompareSheet } from "./compare-sheet";
import type { SectionKey } from "@/lib/summary/sections";

/** Each language in its own script, so a reader finds theirs without knowing English. */
const NATIVE: Record<SummaryLanguage, string> = { en: "English", te: "తెలుగు", hi: "हिन्दी", ta: "தமிழ்", kn: "ಕನ್ನಡ", ml: "മലയാളം" };
const DAILY_CAP = 20;

type Props = {
  procedureId: string;
  /** Why no summary can be made (not reviewed / no discharge), or null. */
  blocker: string | null;
  input: SummaryInput | null;
  configured: boolean;
  generatedToday: number | null;
  /** null = could not be loaded (shown as such, never as "none"). */
  summaries: SummaryRow[] | null;
  operators: { id: string; full_name: string }[];
  defaultClinicianId: string | null;
  /** For the Compare-with-record panel: what the input cannot say by itself. */
  record: { lvefStatus: RecordContext["lvefStatus"]; complicationsWithoutOutcome: number; inputHash: string } | null;
  /** Week 6: closed amendments (number, when), to say which one superseded an approved summary. */
  amendmentClosures?: { no: number; closed_at: string }[];
};

const flagsOf = (row: SummaryRow) => (Array.isArray(row.audit_flags) ? (row.audit_flags as unknown as AuditFlag[]) : []);

/**
 * Discharge summary card (Week 4 spec §7). The model drafts, the audit flags, a named clinician
 * approves. A draft is never shown without the red banner; Approve is disabled while the audit
 * finds an error in the text being approved (re-run live here, and again on the server).
 */
export function DischargeSummaryCard(props: Props) {
  const { procedureId, blocker, input, configured, operators } = props;
  const [rows, setRows] = useState<SummaryRow[]>(props.summaries ?? []);
  const [language, setLanguage] = useState<SummaryLanguage>(() => latestOf(props.summaries ?? [])?.language ?? "en");
  const [generated, setGenerated] = useState(props.generatedToday ?? 0);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [error, setError] = useState<{ message: string; flags?: AuditFlag[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [clinician, setClinician] = useState(props.defaultClinicianId ?? "");

  const versions = useMemo(() => rows.filter((r) => r.language === language).sort((a, b) => b.version - a.version), [rows, language]);
  const current = versions[0] ?? null;
  // The audit re-runs on the text 400 ms after the last edit (spec §6). Until it has caught up,
  // Approve stays disabled, so nothing is approved against a stale audit; the server re-audits too.
  const [auditedText, setAuditedText] = useState("");
  const [editSession, setEditSession] = useState(0);
  const [focusedSection, setFocusedSection] = useState<SectionKey>("why");
  useEffect(() => {
    const t = setTimeout(() => setAuditedText(text), 400);
    return () => clearTimeout(t);
  }, [text]);
  const auditPending = editing && auditedText !== text;
  const liveFlags = useMemo(() => (editing && input ? auditDraft(input, auditedText, language) : []), [editing, input, auditedText, language]);
  const operatorName = (id: string | null) => operators.find((o) => o.id === id)?.full_name ?? "a clinician";
  const recordCtx: RecordContext | null = useMemo(
    () => (input && props.record ? { input, lvefStatus: props.record.lvefStatus, complicationsWithoutOutcome: props.record.complicationsWithoutOutcome } : null),
    [input, props.record],
  );
  const recordChanged = !!(current && props.record && current.input_hash !== props.record.inputHash);
  // Week 6: an approved summary written from a record that has since been amended is superseded —
  // shown, never printed, with a new version one tap away.
  const isSuperseded = (row: SummaryRow) => row.status === "approved" && !!props.record && row.input_hash !== props.record.inputHash;
  const supersededBy = (row: SummaryRow) =>
    (props.amendmentClosures ?? []).filter((a) => !row.approved_at || a.closed_at > row.approved_at).sort((a, b) => a.closed_at.localeCompare(b.closed_at))[0] ?? null;

  if (blocker || !input) {
    return (
      <section className="card" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-sm font-bold uppercase tracking-wide text-slate-700">Discharge summary</h2>
        <p className="mt-1 text-sm text-slate-600">
          {blocker === AMENDING_BLOCKER ? blocker : "Discharge summary available after clinical review and discharge"}
        </p>
      </section>
    );
  }

  const capReached = generated >= DAILY_CAP;
  const generateDisabledReason = !configured
    ? "AI summary not configured on this server"
    : props.generatedToday === null
      ? "Could not check today's summary count. Reload to try again."
      : capReached
        ? `Daily limit reached (${DAILY_CAP} summaries). Try again tomorrow.`
        : null;

  async function generate() {
    setBusy("generate");
    setError(null);
    setEditing(false);
    try {
      const res = await fetch(`/api/procedures/${procedureId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: body.error ?? "Could not draft the summary. Please try again." });
        if (res.status === 429) setGenerated(DAILY_CAP);
        return;
      }
      setRows((r) => [...r, body.summary as SummaryRow]);
      setGenerated((n) => n + 1);
    } catch {
      setError({ message: "No connection. Check your network and try again." });
    } finally {
      setBusy(null);
    }
  }

  function startEdit(row: SummaryRow) {
    const start = row.approved_text ?? row.draft_text;
    setText(start);
    setAuditedText(start);
    setEditSession((n) => n + 1);
    setError(null);
    setEditing(true);
  }

  async function save(approve: boolean) {
    if (!current) return;
    if (approve && !window.confirm(`Approve this ${LANGUAGES[language]} summary as ${operatorName(clinician)}? It cannot be changed afterwards.`)) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/procedures/${procedureId}/summary/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_text: text, approving_clinician_id: clinician || null, approve }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: body.error ?? "Could not save. Please try again.", flags: body.flags });
        return;
      }
      const updated = body.summary as SummaryRow;
      setRows((r) => r.map((x) => (x.id === updated.id ? updated : x)));
      if (approve) setEditing(false);
    } catch {
      setError({ message: "No connection. Your text is still here — try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className={`card space-y-4 ${SUMMARY_FONT_VARIABLES} ${
        // While editing: room for the fixed Compare button on phones; on ≥1024 px the card widens
        // (centred, at most 72rem) so the draft and the record fit side by side.
        editing ? "pb-24 lg:pb-4 lg:ml-[calc(50%-min(36rem,50vw-2rem))] lg:w-[min(72rem,calc(100vw-4rem))]" : ""
      }`}
      aria-labelledby="summary-heading"
      aria-busy={busy !== null}
    >
      <div className="space-y-3">
        <h2 id="summary-heading" className="text-sm font-bold uppercase tracking-wide text-slate-700">Discharge summary</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 sm:flex-none">
            <label htmlFor="summary-language" className="label">Language</label>
            <select
              id="summary-language"
              className="input min-h-11 sm:w-56"
              value={language}
              disabled={busy !== null}
              onChange={(e) => {
                setLanguage(e.target.value as SummaryLanguage);
                setEditing(false);
                setError(null);
              }}
            >
              {(Object.keys(LANGUAGES) as SummaryLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {l === "en" ? "English" : `${NATIVE[l]} (${LANGUAGES[l]})`}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary min-h-11 w-full sm:w-auto"
            disabled={busy !== null || generateDisabledReason !== null}
            aria-describedby={generateDisabledReason ? "generate-reason" : undefined}
            onClick={generate}
          >
            {busy === "generate" ? (
              <>
                <Spinner /> Drafting…
              </>
            ) : current ? (
              "Regenerate (new version)"
            ) : (
              "Generate draft"
            )}
          </button>
        </div>
        {generateDisabledReason && (
          <p id="generate-reason" className="text-sm text-slate-600">{generateDisabledReason}</p>
        )}
        <p role="status" aria-live="polite" className="text-sm text-slate-600">
          {busy === "generate" ? "Drafting… usually 10–20 seconds" : busy === "save" ? "Saving…" : ""}
        </p>
        {error && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
            <p className="font-medium">{error.message}</p>
            {error.flags && <FlagList flags={error.flags} />}
          </div>
        )}
      </div>

      {props.summaries === null ? (
        <p role="alert" className="text-sm text-red-900">Could not load earlier summaries. Reload the page to try again.</p>
      ) : !current ? (
        <p className="text-sm text-slate-600">No {LANGUAGES[language]} summary yet.</p>
      ) : isSuperseded(current) ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
            <p className="font-semibold">
              {supersededBy(current)
                ? `Superseded — record amended on ${formatDateTime(supersededBy(current)!.closed_at)} (amendment #${supersededBy(current)!.no})`
                : "Superseded — the record has changed since this summary was approved"}
            </p>
            <p>
              Approved by {operatorName(current.approving_clinician_id)} · {formatDateTime(current.approved_at)} · v{current.version} · {LANGUAGES[current.language]}.
              It is kept for the record but is not printed.
            </p>
            <button type="button" className="btn-primary min-h-11 w-full sm:w-auto" onClick={generate} disabled={busy !== null || generateDisabledReason !== null}>
              {busy === "generate" ? "Drafting…" : "Regenerate (new version)"}
            </button>
          </div>
          <SummaryMarkdown text={current.approved_text ?? ""} language={current.language} />
        </div>
      ) : current.status === "approved" ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-950">
            Approved by {operatorName(current.approving_clinician_id)} · {formatDateTime(current.approved_at)} · v{current.version} · {LANGUAGES[current.language]}
          </div>
          <SummaryMarkdown text={current.approved_text ?? ""} language={current.language} />
          <div className="flex flex-wrap gap-3">
            <Link href={`/procedures/${procedureId}/print?summary=${current.id}`} className="btn-secondary min-h-11" target="_blank">
              Print
            </Link>
          </div>
          <p className="text-sm text-slate-600">Compare with record is available while editing a draft.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-950">
            <p className="font-bold">AI draft — not reviewed. Do not give to patient.</p>
            <p className="text-sm">
              v{current.version} · {formatDateTime(current.generated_at)}
              {current.approved_text && !editing ? " · edited, not yet approved" : ""}
            </p>
            {flagsOf(current).length > 0 ? (
              <>
                <p className="mt-2 text-sm font-medium">Audit of the generated draft:</p>
                <FlagList flags={flagsOf(current)} />
              </>
            ) : (
              <p className="mt-1 text-sm">Audit of the generated draft: no flags.</p>
            )}
          </div>

          {!editing ? (
            <>
              <SummaryMarkdown text={current.approved_text ?? current.draft_text} language={current.language} />
              <button type="button" className="btn-secondary min-h-11 w-full sm:w-auto" onClick={() => startEdit(current)} disabled={busy !== null}>
                Edit and approve
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <SummaryEditor
                key={`${current.id}:${editSession}`}
                initialText={text}
                input={input}
                language={language}
                flags={liveFlags}
                onChange={setText}
                onFocusSection={setFocusedSection}
                aside={recordCtx ? (k) => <RecordBlock group={k} ctx={recordCtx} /> : undefined}
                asideHeader={recordChanged ? <RecordChanged /> : null}
                disabled={busy !== null}
              />
              {recordCtx && <CompareSheet ctx={recordCtx} focused={focusedSection} changed={recordChanged} />}
              <div>
                <label htmlFor="approving-clinician" className="label">Approving clinician</label>
                <select id="approving-clinician" className="input min-h-11 sm:w-72" value={clinician} onChange={(e) => setClinician(e.target.value)}>
                  <option value="">Choose…</option>
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary min-h-11 w-full sm:w-auto"
                  disabled={busy !== null || auditPending || hasErrors(liveFlags) || !clinician || !text.trim()}
                  onClick={() => save(true)}
                >
                  {busy === "save" ? "Saving…" : "Approve and save"}
                </button>
                <button type="button" className="btn-secondary min-h-11 w-full sm:w-auto" disabled={busy !== null || !text.trim()} onClick={() => save(false)}>
                  Save edit
                </button>
                <button type="button" className="btn-secondary min-h-11 w-full sm:w-auto" disabled={busy !== null} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
              {!clinician && <p className="text-sm text-slate-600">Choose the approving clinician to enable Approve.</p>}
            </div>
          )}
        </div>
      )}

      {versions.length > 0 && (
        <details className="group rounded-lg border border-slate-200">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
            <span aria-hidden className="inline-block text-slate-500 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90">›</span>
            {LANGUAGES[language]} versions ({versions.length})
          </summary>
          <table className="w-full border-t border-slate-200 text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Version</th>
                <th scope="col" className="py-2 pr-2 font-medium">Status</th>
                <th scope="col" className="py-2 pr-2 font-medium">Generated</th>
                <th scope="col" className="py-2 pr-3 font-medium">Approved by</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">v{v.version}</td>
                  <td className="py-2 pr-2">{isSuperseded(v) ? "Superseded" : v.status === "approved" ? "Approved" : "Draft"}</td>
                  <td className="py-2 pr-2">{formatDateTime(v.generated_at)}</td>
                  <td className="py-2 pr-3">{v.status === "approved" ? operatorName(v.approving_clinician_id) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function latestOf(rows: SummaryRow[]) {
  return [...rows].sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] ?? null;
}

function FlagList({ flags }: { flags: AuditFlag[] }) {
  return (
    <ul className="mt-1 space-y-1">
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

function Spinner() {
  return <span aria-hidden className="mr-2 inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" />;
}
