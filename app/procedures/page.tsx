import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listProcedures } from "@/lib/queries/procedures";
import { formatDate } from "@/lib/dates";
import { label } from "@/lib/labels";
import { StatusBadge } from "@/components/report/section";

export const dynamic = "force-dynamic";

export default async function ProceduresPage() {
  const db = createClient();
  const { procedures, error } = await listProcedures(db);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Procedures</h1>
        <Link href="/procedures/new" className="btn-primary">
          + New procedure
        </Link>
      </div>

      {error ? (
        <div role="alert" className="card space-y-2">
          <p className="font-medium">Could not load procedures.</p>
          <Link href="/procedures" className="btn-secondary">
            Try again
          </Link>
        </div>
      ) : procedures.length === 0 ? (
        <p className="card text-slate-600">No procedures yet.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">{procedures.length} procedures</p>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {procedures.map((p) => (
              <li key={p.id}>
                <Link href={`/procedures/${p.id}`} className="flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                  <span className="flex items-center gap-2 sm:w-44">
                    <span className="font-mono font-semibold">{p.case_code}</span>
                    <StatusBadge status={p.status} />
                  </span>
                  <span className="text-sm text-slate-600 sm:w-28">{formatDate(p.procedure_date)}</span>
                  <span className="min-w-0 flex-1 break-words font-medium">{p.patient?.full_name ?? "—"}</span>
                  <span className="text-sm text-slate-700 sm:w-40 sm:text-right">{label(p.indication)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
