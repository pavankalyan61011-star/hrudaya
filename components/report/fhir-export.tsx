import type { Bundle, Resource } from "fhir/r4";

type Props = { procedureId: string; caseCode: string; bundle: Bundle | null; unavailableReason?: string };

/**
 * Export FHIR (spec §7). Reviewed procedures get a download link and a collapsible, read-only
 * preview grouped by resource type; anything else gets a disabled button with the reason visible
 * (a tooltip alone is unreadable on a phone). Native <details> — no client JavaScript.
 */
export function FhirExport({ procedureId, caseCode, bundle, unavailableReason = "Available after clinical review" }: Props) {
  if (!bundle) {
    return (
      <div className="card flex flex-wrap items-center gap-3">
        <button type="button" disabled aria-describedby="fhir-unavailable" title={unavailableReason} className="btn-secondary">
          Export FHIR
        </button>
        <p id="fhir-unavailable" className="text-sm text-slate-600">
          {unavailableReason}
        </p>
      </div>
    );
  }

  const groups = new Map<string, Resource[]>();
  for (const e of bundle.entry ?? []) {
    if (!e.resource) continue;
    const list = groups.get(e.resource.resourceType) ?? [];
    list.push(e.resource);
    groups.set(e.resource.resourceType, list);
  }

  return (
    <section className="card space-y-3" aria-labelledby="fhir-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="fhir-heading" className="text-sm font-bold uppercase tracking-wide text-slate-700">
            FHIR R4 export
          </h2>
          <p className="text-sm text-slate-600">
            Document Bundle · {bundle.entry?.length ?? 0} resources · synthetic data
          </p>
        </div>
        <a href={`/api/fhir/procedures/${procedureId}?download=1`} download={`${caseCode}.fhir.json`} className="btn-primary">
          Export FHIR
        </a>
      </div>
      <details className="group rounded-lg border border-slate-200">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-medium">
          <Chevron group="group" />
          FHIR preview
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-200">
          {[...groups.entries()].map(([type, resources]) => (
            <li key={type}>
              <details className="group/type">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3">
                  <span className="flex items-center gap-2 font-mono text-sm">
                    <Chevron group="type" />
                    {type}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{resources.length}</span>
                </summary>
                {/* Wraps rather than scrolls sideways, so nothing is hidden at phone width. */}
                <pre className="whitespace-pre-wrap break-all bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800">
                  {JSON.stringify(resources.length === 1 ? resources[0] : resources, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Disclosure arrow — flex summaries lose the browser's own marker. Turns when open. */
function Chevron({ group }: { group: "group" | "type" }) {
  const turn = group === "group" ? "group-open:rotate-90" : "group-open/type:rotate-90";
  return (
    <span aria-hidden className={`inline-block text-slate-500 motion-safe:transition-transform motion-safe:duration-150 ${turn}`}>
      ›
    </span>
  );
}
