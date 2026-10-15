import Link from "next/link";

export const STEPS = [
  "Patient",
  "Indication & access",
  "Angiography",
  "Intervention & devices",
  "Procedure details",
  "Discharge",
] as const;

type Props = { step: number; procedureId: string | null; caseCode?: string; patientLabel?: string };

/** Step title, progress, and links back to steps already reachable on this draft. */
export function StepHeader({ step, procedureId, caseCode, patientLabel }: Props) {
  return (
    <div className="mb-4 space-y-3">
      <div>
        <p className="text-sm text-slate-600">
          {caseCode ? <span className="font-mono font-semibold text-slate-800">{caseCode}</span> : "New procedure"}
          {patientLabel && <span> · {patientLabel}</span>}
          <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Draft</span>
        </p>
        <h1 className="text-xl font-bold">
          Step {step} of 6 — {STEPS[step - 1]}
        </h1>
      </div>
      <nav aria-label="Form steps">
        <ol className="grid grid-cols-6 gap-1">
          {STEPS.map((name, i) => {
            const n = i + 1;
            const current = n === step;
            const bar = <span className={`block h-1.5 rounded-full ${n <= step ? "bg-sky-700" : "bg-slate-200"}`} />;
            return (
              <li key={name}>
                {procedureId && !current ? (
                  <Link href={`/procedures/new?id=${procedureId}&step=${n}`} className="block py-2" title={name}>
                    {bar}
                    <span className="sr-only">
                      Go to step {n}: {name}
                    </span>
                  </Link>
                ) : (
                  <span className="block py-2" aria-current={current ? "step" : undefined}>
                    {bar}
                    <span className="sr-only">
                      Step {n}: {name}
                      {current ? " (current)" : ""}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
