import type { Change } from "@/lib/amendments/diff";
import { formatDateTime } from "@/lib/report-format";
import { ChangesTable } from "./changes-table";

export type AmendmentView = {
  id: string;
  amendment_no: number;
  status: "open" | "closed";
  reason: string;
  opened_at: string;
  opened_by_label: string;
  closed_at: string | null;
  closed_by_label: string | null;
  reviewing_clinician: string | null;
  changes: Change[] | null;
};

/**
 * The Amendments card on the report (Week 6 spec §4): one entry per amendment, newest first —
 * number, reason, opened by/at, re-reviewed by/at, and the changes that were signed. An open
 * amendment is shown here too, marked in progress.
 */
export function AmendmentsCard({ amendments }: { amendments: AmendmentView[] }) {
  if (!amendments.length) return null;
  return (
    <section className="card space-y-4" aria-labelledby="amendments-heading">
      <h2 id="amendments-heading" className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
        Amendments
      </h2>
      <ol className="space-y-4">
        {[...amendments].sort((a, b) => b.amendment_no - a.amendment_no).map((a) => (
          <li key={a.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Amendment #{a.amendment_no}</h3>
              {a.status === "open" ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">In progress</span>
              ) : (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {a.changes?.length ? `${a.changes.length} change${a.changes.length === 1 ? "" : "s"}` : "No changes"}
                </span>
              )}
            </div>
            <p className="break-words"><span className="text-slate-600">Reason:</span> {a.reason}</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-slate-600">Opened: </dt><dd className="inline">{a.opened_by_label}, {formatDateTime(a.opened_at)}</dd></div>
              <div>
                <dt className="inline text-slate-600">Re-reviewed: </dt>
                <dd className="inline">
                  {a.status === "closed" ? `${a.reviewing_clinician ?? "Clinician not recorded"}, ${formatDateTime(a.closed_at)}` : "Not yet"}
                </dd>
              </div>
            </dl>
            {a.status === "closed" && <ChangesTable changes={a.changes ?? []} />}
          </li>
        ))}
      </ol>
    </section>
  );
}
