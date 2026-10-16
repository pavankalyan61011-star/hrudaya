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
import { buildSummaryInput, inputHash } from "@/lib/summary/input";
import { listAmendments } from "@/lib/queries/amendments";

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
        <p className="font-medium">
          {(p.status as string) === "amending"
            ? "The print report is available after the amendment is re-reviewed."
            : "The print report is available after clinical review."}
        </p>
        <Link href={`/procedures/${p.id}`} className="btn-secondary">Back to the report</Link>
      </div>
    );
  }

  const [summaries, ops, amendmentRows] = await Promise.all([
    db.from("discharge_summaries").select("*").eq("procedure_id", p.id).eq("status", "approved").order("language").order("version", { ascending: false }),
    listOperators(db),
    listAmendments(db, p.id),
  ]);
  const operatorName = (id: string | null) => ops.operators.find((o) => o.id === id)?.full_name ?? NOT_RECORDED;
  // Week 6: a summary approved before an amendment changed the record is superseded — not printed.
  const currentHash = inputHash(buildSummaryInput(p));
  const closed = amendmentRows.amendments.filter((a) => a.status === "closed" && a.closed_at);
  const chosen = (summaries.data ?? []).filter((s) => !searchParams.summary || s.id === searchParams.summary);
  const approved = chosen.filter((s) => s.input_hash === currentHash);
  const superseded = chosen
    .filter((s) => s.input_hash !== currentHash)
    .map((s) => ({ s, by: closed.filter((a) => !s.approved_at || a.closed_at! > s.approved_at).sort((a, b) => a.closed_at!.localeCompare(b.closed_at!))[0] ?? null }));

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
      {amendmentRows.error && (
        <p role="alert" className="card text-sm text-red-900 print:hidden">
          Could not load this record&apos;s amendments, so they are not in this printout. Reload to try again.
        </p>
      )}
      {searchParams.summary && approved.length === 0 && superseded.length === 0 && !summaries.error && (
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
        {superseded.length > 0 && (
          <ul className="space-y-1 text-sm text-slate-700">
            {superseded.map(({ s, by }) => (
              <li key={s.id}>
                Discharge summary ({LANGUAGES[s.language]}, version {s.version}) superseded
                {by ? ` by amendment #${by.amendment_no} on ${formatDateTime(by.closed_at)}` : " — the record changed after approval"} — not printed.
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <section className="break-inside-avoid space-y-1" aria-labelledby="print-amendments">
            <h2 id="print-amendments" className="text-sm font-bold uppercase tracking-wide text-slate-700">Amendments</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th scope="col" className="border-b border-slate-300 py-1 pr-2 font-semibold">#</th>
                  <th scope="col" className="border-b border-slate-300 py-1 pr-2 font-semibold">Date</th>
                  <th scope="col" className="border-b border-slate-300 py-1 pr-2 font-semibold">Reason</th>
                  <th scope="col" className="border-b border-slate-300 py-1 pr-2 font-semibold">Changes</th>
                  <th scope="col" className="border-b border-slate-300 py-1 font-semibold">Re-reviewed by</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 align-top">
                    <td className="py-1 pr-2">{a.amendment_no}</td>
                    <td className="py-1 pr-2">{formatDateTime(a.closed_at)}</td>
                    <td className="break-words py-1 pr-2">{a.reason}</td>
                    <td className="py-1 pr-2">{Array.isArray(a.changes) ? a.changes.length : 0}</td>
                    <td className="py-1">{(a.reviewer as { full_name: string } | null)?.full_name ?? NOT_RECORDED}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
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
