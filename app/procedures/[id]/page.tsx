import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull, type ProcedureFull } from "@/lib/queries/procedures";
import { listOperators } from "@/lib/queries/operators";
import { formatDate, todayIST } from "@/lib/dates";
import { label } from "@/lib/labels";
import { NOT_RECORDED, formatDateTime } from "@/lib/report-format";
import { StatusBadge } from "@/components/report/section";
import { ReviewPanel } from "@/components/report/review-panel";
import { FhirExport } from "@/components/report/fhir-export";
import { DischargeSummaryCard } from "@/components/report/discharge-summary";
import { getCurrentUser } from "@/lib/queries/auth";
import { buildSummaryInput } from "@/lib/summary/input";
import { summaryBlocker, toClientSummary } from "@/lib/summary/api";
import { summaryConfigured } from "@/lib/summary/generate";
import { procedureToBundle } from "@/lib/fhir/mapper";
import { SyntheticNotice } from "@/components/synthetic-notice";
import { ProcedureReport } from "@/components/report/procedure-report";
import { STEPS } from "../new/step-header";

export const dynamic = "force-dynamic";

/** Enum value for display; null → "Not recorded". */
const en = (v: string | null) => (v ? label(v) : NOT_RECORDED);

/**
 * What the discharge-summary card needs (Week 4 spec §7). Reads with the user's own client (RLS).
 * A failed read is passed on as null and shown as "could not load", never as "none".
 */
async function loadSummaryCard(db: ReturnType<typeof createClient>, p: ProcedureFull) {
  const blocker = summaryBlocker(p);
  if (blocker) return { blocker, input: null, configured: false, generatedToday: null, summaries: null };

  const user = await getCurrentUser();
  const [list, today] = await Promise.all([
    db.from("discharge_summaries").select("*").eq("procedure_id", p.id).order("version", { ascending: false }),
    user
      ? db
          .from("discharge_summaries")
          .select("id", { count: "exact", head: true })
          .eq("generated_by", user.id)
          .gte("generated_at", `${todayIST()}T00:00:00+05:30`)
      : Promise.resolve({ count: null, error: null }),
  ]);
  return {
    blocker: null,
    input: buildSummaryInput(p),
    configured: summaryConfigured(),
    generatedToday: today.error ? null : today.count,
    summaries: list.error ? null : (list.data ?? []).map(toClientSummary),
  };
}

export default async function ProcedureDetailPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const { procedure: p, error } = await getProcedureFull(db, params.id);
  if (error) {
    return (
      <div role="alert" className="card space-y-2">
        <p className="font-medium">Could not load this procedure.</p>
        <Link href={`/procedures/${params.id}`} className="btn-secondary">
          Try again
        </Link>
      </div>
    );
  }
  if (!p) notFound();
  const { operators } = p.status === "completed" || p.status === "reviewed" ? await listOperators(db) : { operators: [] };
  const summary = await loadSummaryCard(db, p);


  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <Link href="/procedures" className="inline-flex min-h-11 items-center text-sm text-sky-800 underline">
          ← All procedures
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">{p.case_code}</h1>
          <StatusBadge status={p.status} />
        </div>
        <p className="text-slate-700">
          {en(p.procedure_type)} · {p.procedure_date ? formatDate(p.procedure_date) : NOT_RECORDED} · {p.operator?.full_name ?? "Operator not recorded"}
        </p>
        {p.facility && (
          <p className="text-sm text-slate-600">
            {p.facility.name} — {p.facility.cath_lab_name}, {p.facility.city}
          </p>
        )}
        {p.status === "reviewed" && (
          <p className="text-sm font-medium text-sky-900">
            Reviewed by {p.reviewer?.full_name ?? NOT_RECORDED} on {formatDateTime(p.reviewed_at)}
          </p>
        )}
      </header>

      {p.status === "draft" && (
        <div className="card space-y-2 border-amber-300 bg-amber-50">
          <p className="font-medium text-amber-950">This record is a draft and may be incomplete.</p>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <Link key={s} href={`/procedures/new?id=${p.id}&step=${i + 1}`} className="btn-secondary text-sm">
                {i + 1}. {s}
              </Link>
            ))}
          </div>
        </div>
      )}
      {p.status === "completed" && <ReviewPanel procedureId={p.id} operators={operators} defaultClinicianId={p.primary_operator_id} />}
      {/* Spec §7: export and preview for reviewed procedures only; built from the rows already loaded. */}
      <FhirExport procedureId={p.id} caseCode={p.case_code} bundle={p.status === "reviewed" ? procedureToBundle(p, new Date().toISOString()) : null} />
      <DischargeSummaryCard procedureId={p.id} operators={operators} defaultClinicianId={p.primary_operator_id} {...summary} />

      <ProcedureReport p={p} />

      <SyntheticNotice />
    </article>
  );
}
