import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull } from "@/lib/queries/procedures";
import { listOperators } from "@/lib/queries/operators";
import { currentChanges, type OpenAmendment } from "@/lib/amendments/api";
import { formatDateTime } from "@/lib/report-format";
import { StatusBadge } from "@/components/report/section";
import { SignAmendment } from "@/components/amendments/sign-amendment";

export const dynamic = "force-dynamic";

/**
 * Review the changes and re-review (Week 6 spec §4). The list is computed here exactly as the close
 * route computes it (snapshot at opening → record now), so what is shown is what will be stored.
 */
export default async function AmendmentSignPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const { procedure: p, error } = await getProcedureFull(db, params.id);
  if (error) {
    return (
      <div role="alert" className="card space-y-2">
        <p className="font-medium">Could not load this procedure.</p>
        <Link href={`/procedures/${params.id}/amendment`} className="btn-secondary">Try again</Link>
      </div>
    );
  }
  if (!p) notFound();
  if ((p.status as string) !== "amending") redirect(`/procedures/${p.id}`);

  const [{ data: open }, { operators }] = await Promise.all([
    db.from("procedure_amendments").select("id, amendment_no, snapshot, reason, opened_at").eq("procedure_id", p.id).eq("status", "open").maybeSingle(),
    listOperators(db),
  ]);
  if (!open) redirect(`/procedures/${p.id}`);
  const changes = currentChanges(open as unknown as OpenAmendment, p);

  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <Link href={`/procedures/${p.id}`} className="inline-flex min-h-11 items-center text-sm text-sky-800 underline">← Back to the report</Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">{p.case_code}</h1>
          <StatusBadge status="amending" />
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Amendment #{open.amendment_no}, opened {formatDateTime(open.opened_at)}</p>
          <p className="mt-1 break-words">Reason: {open.reason}</p>
        </div>
      </header>
      <SignAmendment
        procedureId={p.id}
        amendmentNo={open.amendment_no}
        initialChanges={changes}
        operators={operators}
        defaultClinicianId={p.primary_operator_id}
      />
    </article>
  );
}
