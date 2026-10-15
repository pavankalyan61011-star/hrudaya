import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull, type ProcedureFull } from "@/lib/queries/procedures";
import { ageOn, formatDate } from "@/lib/dates";
import { label, timi } from "@/lib/labels";
import { NOT_RECORDED, guidewireText, lesionName, medicationLine, orNotRecorded, phaseHeading } from "@/lib/report-format";
import { Facts, Section, StatusBadge } from "@/components/report/section";
import { SyntheticNotice } from "@/components/synthetic-notice";
import { STEPS } from "../new/step-header";

export const dynamic = "force-dynamic";

type Device = ProcedureFull["interventions"][number]["devices_used"][number];

const yesNo = (v: boolean | null) => (v === null ? NOT_RECORDED : v ? "Yes" : "No");
const num = (v: number | null, unit: string) => (v === null ? null : `${v} ${unit}`);
/** Enum value for display; null → "Not recorded". */
const en = (v: string | null) => (v ? label(v) : NOT_RECORDED);

function deviceLine(d: Device) {
  const size = `${d.diameter_mm} × ${d.length_mm} mm`;
  const atm = d.inflation_atm ? ` @ ${d.inflation_atm} atm` : "";
  const qty = d.quantity > 1 ? ` ×${d.quantity}` : "";
  return `${d.product_name} ${size}${atm}${qty}`;
}

function CulpritTag() {
  return (
    <>
      {" · "}
      <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-semibold text-white">Culprit lesion</span>
    </>
  );
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

  const pt = p.patient;
  const vesselById = new Map(p.vessel_findings.map((v) => [v.id, v]));
  const lesionOf = (id: string) => vesselById.get(id);

  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <Link href="/procedures" className="text-sm text-sky-800 underline">
          ← All procedures
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">{p.case_code}</h1>
          <StatusBadge status={p.status} />
        </div>
        <p className="text-slate-700">
          {en(p.procedure_type)} · {p.procedure_date ? formatDate(p.procedure_date) : NOT_RECORDED} · {p.operator?.full_name ?? "Operator not recorded"}
        </p>
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

      <Section title="Patient">
        {pt ? (
          <>
            <Facts
              items={[
                ["Name", pt.full_name],
                ["MRN", <span key="mrn" className="font-mono">{pt.mrn}</span>],
                ["Age / sex", `${ageOn(pt.date_of_birth, p.procedure_date ?? pt.date_of_birth)} y · ${label(pt.sex)}`],
                ["Date of birth", formatDate(pt.date_of_birth)],
              ]}
            />
            <h3 className="mb-1 mt-3 text-sm font-semibold text-slate-700">Risk factors</h3>
            {pt.risk_factors.length === 0 ? (
              <p className="text-slate-600">None recorded</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {pt.risk_factors.map((r) => (
                  <li key={r.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                    {label(r.factor)}
                    {r.detail ? ` — ${r.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p>{NOT_RECORDED}</p>
        )}
      </Section>

      <Section title="Presentation">
        <Facts items={[["Indication", en(p.indication)], ["Troponin elevated", yesNo(p.troponin_elevated)], ["ECG", p.ecg_findings]]} />
        <p className="mt-3 whitespace-pre-line">{orNotRecorded(p.presentation_notes)}</p>
      </Section>

      <Section title="Access">
        <Facts
          items={[
            ["Access site", en(p.access_site)],
            ["Sheath", p.sheath_size_fr ? `${p.sheath_size_fr}F` : null],
            ["Diagnostic catheters", p.diagnostic_catheters.length ? p.diagnostic_catheters.join(", ") : null],
            ["Guiding catheter", p.guiding_catheter],
            ["Primary operator", p.operator ? `${p.operator.full_name} (${label(p.operator.role)})` : null],
          ]}
        />
      </Section>

      <Section title="Coronary angiography">
        {p.vessel_findings.length === 0 ? (
          <p className="text-slate-600">No findings recorded</p>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th scope="col" className="w-2/5 pb-2 font-medium">Vessel</th>
                <th scope="col" className="pb-2 font-medium">Stenosis</th>
                <th scope="col" className="pb-2 font-medium">Pre-intervention TIMI flow</th>
              </tr>
            </thead>
            <tbody>
              {p.vessel_findings.map((v) => (
                <tr key={v.id} className={`border-t border-slate-100 align-top ${v.is_culprit ? "bg-red-50" : ""}`}>
                  <td className="py-2 pr-2">
                    <span className="font-semibold">{lesionName(v.vessel, v.segment)}</span>
                    {v.is_culprit && <CulpritTag />}
                    {v.lesion_notes && <span className="block break-words text-xs text-slate-600">{v.lesion_notes}</span>}
                  </td>
                  <td className="py-2">{v.stenosis_pct === 0 ? "0% (normal)" : `${v.stenosis_pct}%`}</td>
                  <td className="py-2">{timi(v.timi_flow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Intervention and devices">
        {p.interventions.length === 0 ? (
          <p className="text-slate-600">{p.procedure_type === "diagnostic_angiography" ? "Diagnostic angiography only — no intervention." : "None recorded"}</p>
        ) : (
          <div className="space-y-5">
            {p.interventions.map((iv) => (
              <div key={iv.id} className="space-y-3">
                <h3 className="font-semibold">
                  {(() => {
                    const v = lesionOf(iv.vessel_finding_id);
                    return v ? (
                      <>
                        {lesionName(v.vessel, v.segment)}
                        {v.is_culprit && <CulpritTag />}
                      </>
                    ) : (
                      NOT_RECORDED
                    );
                  })()}
                  <span className="block text-sm font-normal text-slate-700">{label(iv.intervention_type)}</span>
                </h3>
                <Facts
                  items={[
                    ["Guidewire", guidewireText(iv.guidewire)],
                    ["Residual stenosis", `${iv.residual_stenosis_pct}%`],
                    ["Final flow", timi(iv.timi_flow_post)],
                    ["Result", iv.success ? "Successful" : "Not successful"],
                    ["Dissection", iv.dissection ? "Yes" : "No"],
                    ["Perforation", iv.perforation ? "Yes" : "No"],
                  ]}
                />
                {iv.devices_used.length > 0 && (
                  <ol className="space-y-2">
                    {(["pre_dilation", "deployment", "post_dilation", "other"] as const).flatMap((phase) =>
                      iv.devices_used
                        .filter((d) => d.phase === phase)
                        .map((d) => (
                          <li key={d.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                            <span className="block text-xs font-semibold uppercase text-slate-600">{phaseHeading(phase, d.category)}</span>
                            <span className="block break-words">{deviceLine(d)}</span>
                            {d.lot_number && <span className="block font-mono text-xs">Lot {d.lot_number}</span>}
                          </li>
                        )),
                    )}
                  </ol>
                )}
                {iv.notes && <p className="text-sm text-slate-700">{iv.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Procedure details">
        <Facts
          items={[
            ["Contrast", num(p.contrast_volume_ml, "mL")],
            ["Procedure duration", num(p.procedure_duration_min, "min")],
            ["Fluoroscopy", num(p.fluoroscopy_time_min, "min")],
            ["Radiation dose (mGy)", p.radiation_dose_mgy],
            ["LVEF", p.lvef_pct === null ? null : `${p.lvef_pct}%`],
            ["Haemostasis", en(p.haemostasis_method)],
          ]}
        />
      </Section>

      <Section title="Complications">
        {p.complications.length === 0 ? (
          <p>None</p>
        ) : (
          <ul className="space-y-2">
            {p.complications.map((c) => (
              <li key={c.id}>
                <span className="font-semibold">{label(c.complication)}</span> ({label(c.severity)}) — {c.management}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Final impression">
        <p className="whitespace-pre-line">{orNotRecorded(p.outcome_summary)}</p>
      </Section>

      <Section title="Discharge">
        {!p.discharge ? (
          <p className="font-medium">Not yet discharged</p>
        ) : (
          <div className="space-y-4">
            <Facts
              items={[
                ["Discharge date", formatDate(p.discharge.discharge_date)],
                ["Length of stay", `${p.discharge.length_of_stay_hours} h`],
                ["Clinical status", p.discharge.clinical_status],
                ["Follow-up", `${formatDate(p.discharge.follow_up_date)} — ${p.discharge.follow_up_clinic}`],
              ]}
            />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-700">Medications</h3>
              {p.discharge.discharge_medications.length === 0 ? (
                <p className="text-slate-600">None recorded</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {p.discharge.discharge_medications.map((m) => (
                    <li key={m.id} className="py-2">
                      <span>{medicationLine(m)}</span>
                      {m.is_dapt && (
                        <>
                          {" "}
                          <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-900">DAPT</span>
                        </>
                      )}
                      {(m.duration || m.purpose) && (
                        <span className="block text-sm text-slate-600">{[m.purpose, m.duration].filter(Boolean).join(" · ")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {p.discharge.advice.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-700">Advice</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {p.discharge.advice.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}
            {p.discharge.red_flags.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <h3 className="mb-1 text-sm font-semibold text-red-900">Seek emergency care for</h3>
                <ul className="list-disc space-y-1 pl-5 text-red-950">
                  {p.discharge.red_flags.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      <SyntheticNotice />
    </article>
  );
}
