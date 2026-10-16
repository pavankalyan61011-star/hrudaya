import { NOT_RECORDED } from "@/lib/report-format";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card break-inside-avoid">
      <h2 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

/** Label/value pairs; two columns from small screens up, one on a phone. */
export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1 sm:block sm:border-0 sm:pb-0">
          <dt className="text-sm text-slate-600">{k}</dt>
          <dd className="text-right font-medium sm:text-left">{v === null || v === undefined || v === "" ? NOT_RECORDED : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusBadge({ status, amendedCount = 0 }: { status: "draft" | "completed" | "reviewed" | "amending"; amendedCount?: number }) {
  // Week 6: an open amendment is never shown as "Draft".
  if (status === "amending") {
    return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">Amendment in progress</span>;
  }
  if (status === "reviewed") {
    return (
      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">
        Reviewed{amendedCount > 0 ? ` · amended ×${amendedCount}` : ""}
      </span>
    );
  }
  return status === "completed" ? (
    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Completed</span>
  ) : (
    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">Draft</span>
  );
}
