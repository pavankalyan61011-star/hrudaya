import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull } from "@/lib/queries/procedures";
import { listOperators } from "@/lib/queries/operators";
import { formatDate } from "@/lib/dates";
import { label } from "@/lib/labels";
import { NOT_RECORDED, formatDateTime } from "@/lib/report-format";
import { ProcedureReport } from "@/components/report/procedure-report";
import { SummaryMarkdown } from "@/components/report/summary-markdown";
import { PrintButton } from "@/components/report/print-button";
import { LANGUAGES } from "@/lib/summary/prompt";
import { SUMMARY_FONT_VARIABLES } from "@/lib/summary/fonts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print — Hrudaya" };

/**
 * Print report (Week 4 spec §8). Server-rendered from the database by a template — no AI here.
 * Auth: the procedures layout and the middleware. Reviewed procedures only.
 *   Page 1: the clinician report (the same component as the screen), MRN and initials only.
 *   Then one page per APPROVED summary, or only `?summary=<id>` when given. Drafts never print.
 * A4, 18 mm margins, page numbers and the synthetic-data footer come from @page in globals.css.
 */
export default async function PrintPage({ params, searchParams }: { params: { id: string }; searchParams: { summary?: string } }) {
  const db = createClient();
  const { procedure: p, error } = await getProcedureFull(db, params.id);
  if (error) {
    return (
      <div role="alert" className="card space-y-2">
        <p className="font-medium">Could not load this procedure.</p>
        <Link href={`/procedures/${params.id}/print`} className="btn-secondary">Try again</Link>
      </div>
    );
  }
  if (!p) notFound();
  if (p.status !== "reviewed") {
    return (
      <div className="card space-y-2">
        <p className="font-medium">The print report is available after clinical review.</p>
        <Link href={`/procedures/${p.id}`} className="btn-secondary">Back to the report</Link>
      </div>
    );
  }

  const [summaries, ops] = await Promise.all([
    db.from("discharge_summaries").select("*").eq("procedure_id", p.id).eq("status", "approved").order("language").order("version", { ascending: false }),
    listOperators(db),
  ]);
  const operatorName = (id: string | null) => ops.operators.find((o) => o.id === id)?.full_name ?? NOT_RECORDED;
  const approved = (summaries.data ?? []).filter((s) => !searchParams.summary || s.id === searchParams.summary);

  return (
    <div className={`print-report space-y-4 ${SUMMARY_FONT_VARIABLES}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/procedures/${p.id}`} className="inline-flex min-h-11 items-center text-sm text-sky-800 underline">
          ← Back to the report
        </Link>
        <PrintButton />
      </div>
      {summaries.error && (
        <p role="alert" className="card text-sm text-red-900 print:hidden">
          Could not load the approved discharge summaries, so they are not in this printout. Reload to try again.
        </p>
      )}
      {searchParams.summary && approved.length === 0 && !summaries.error && (
        <p className="card text-sm text-slate-700 print:hidden">That summary is not approved, so it is not printed. Drafts are never printed.</p>
      )}

      <article className="space-y-4">
        <header className="space-y-1 border-b-2 border-slate-800 pb-3">
          <SyntheticLine />
          {p.facility && (
            <p className="text-sm font-semibold text-slate-800">
              {p.facility.name} — {p.facility.cath_lab_name}, {p.facility.city}
            </p>
          )}
          <h1 className="text-xl font-bold">Cardiac catheterisation procedure report</h1>
          <p className="font-mono text-lg font-bold">{p.case_code}</p>
          <p className="text-sm text-slate-700">
            {label(p.procedure_type)} · {p.procedure_date ? formatDate(p.procedure_date) : NOT_RECORDED} · {p.operator?.full_name ?? "Operator not recorded"}
          </p>
          <p className="text-sm text-slate-700">
            Indication: {p.indication ? label(p.indication) : NOT_RECORDED} · Urgency: {p.urgency ? label(p.urgency) : NOT_RECORDED}
          </p>
          <p className="text-sm font-medium">
            Reviewed by {p.reviewer?.full_name ?? NOT_RECORDED} on {formatDateTime(p.reviewed_at)}
          </p>
        </header>
        <ProcedureReport p={p} print />
      </article>

      {approved.map((s) => (
        <article key={s.id} className="print-summary space-y-3 border-t-2 border-slate-800 pt-4 print:border-t-0 print:pt-0">
          <header className="border-b border-slate-300 pb-2">
            <SyntheticLine />
            <p className="text-sm text-slate-700">
              {p.facility?.name ?? "Hrudaya"} · <span className="font-mono">{p.case_code}</span> · MRN <span className="font-mono">{p.patient?.mrn ?? NOT_RECORDED}</span>
            </p>
            <h2 className="text-lg font-bold">Discharge summary — {LANGUAGES[s.language]}</h2>
          </header>
          <SummaryMarkdown text={s.approved_text ?? ""} language={s.language} />
          <footer className="break-inside-avoid border-t border-slate-300 pt-2 text-sm">
            Approved by <strong>{operatorName(s.approving_clinician_id)}</strong> on {formatDateTime(s.approved_at)} · version {s.version}.{" "}
            {/* Owner, 2026-10-15: no AI vendor or model name where a patient or clinician sees it; the
                model stays on the row (discharge_summaries.model) for provenance. */}
            Drafted with AI assistance (prompt {s.prompt_version}); checked and approved by the clinician named.
          </footer>
        </article>
      ))}
    </div>
  );
}

/** In the body as well as the @page footer: Safari does not print margin boxes. */
function SyntheticLine() {
  return <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Synthetic data — Hrudaya demo</p>;
}
