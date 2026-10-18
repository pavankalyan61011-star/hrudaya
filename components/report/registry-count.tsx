import Link from "next/link";

/**
 * "Registry · n of 42" on the report header (Week 7 spec §3.7). Owner, 2026-10-18: never "NIC
 * fields" in the UI — the list is modelled on CathPCI v5 and the NIC mapping is pending. A disclosure
 * rather than a hover tooltip, so it works by tap on a phone; each missing element opens the sheet or
 * step that holds it when the record can be edited. Sign-off is not blocked by it.
 */
export function RegistryCount({ filled, total, missing }: { filled: number; total: number; missing: { key: string; label: string; href: string | null }[] }) {
  const complete = missing.length === 0;
  return (
    <details className="group relative inline-block">
      <summary
        title="modelled on CathPCI v5; NIC mapping pending"
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded px-2 text-xs font-semibold ${complete ? "text-emerald-900" : "text-slate-800"} bg-slate-100`}
      >
        Registry · {filled} of {total}
        <span aria-hidden className="text-slate-500 group-open:rotate-90">›</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg">
        <p className="text-xs text-slate-600">Modelled on CathPCI v5; NIC mapping pending.</p>
        {complete ? (
          <p className="mt-2">Every element is recorded.</p>
        ) : (
          <>
            <p className="mt-2 font-medium">Missing ({missing.length})</p>
            <ul className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
              {missing.map((m) => (
                <li key={m.key}>
                  {m.href ? (
                    <Link href={m.href} scroll={false} className="inline-flex min-h-11 items-center text-sky-800 underline">
                      {m.label}
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center text-slate-700">{m.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
