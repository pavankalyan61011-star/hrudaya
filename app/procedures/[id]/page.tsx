import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull, type ProcedureFull } from "@/lib/queries/procedures";
import { listOperators } from "@/lib/queries/operators";
import { ageOn, formatDate } from "@/lib/dates";
import { label, timi } from "@/lib/labels";
import {
  NOT_RECORDED,
  formatDateTime,
  formatTime,
  guidewireText,
  lengthOfStay,
  lesionName,
  lvefText,
  measurement,
  medicationLine,
  minutesBetween,
  orNotRecorded,
  phaseHeading,
  procedureMedicationLine,
  timingHeading,
} from "@/lib/report-format";
import { Facts, Section, StatusBadge } from "@/components/report/section";
import { ReviewPanel } from "@/components/report/review-panel";
import { FhirExport } from "@/components/report/fhir-export";
import { DischargeSummaryCard } from "@/components/report/discharge-summary";
import { getCurrentUser } from "@/lib/queries/auth";
import { todayIST } from "@/lib/dates";
import { buildSummaryInput } from "@/lib/summary/input";
import { summaryBlocker } from "@/lib/summary/api";
import { summaryConfigured } from "@/lib/summary/generate";
import { procedureToBundle } from "@/lib/fhir/mapper";
import { SyntheticNotice } from "@/components/synthetic-notice";
import { STEPS } from "../new/step-header";

export const dynamic = "force-dynamic";

type Device = ProcedureFull["interventions"][number]["devices_used"][number];

const yesNo = (v: boolean | null) => (v === null ? NOT_RECORDED : v ? "Yes" : "No");
const num = (v: number | null, unit: string) => (v === null ? null : `${v} ${unit}`);
/** Enum value for display; null → "Not recorded". */
const en = (v: string | null) => (v ? label(v) : NOT_RECORDED);
const pressure = (sys: number | null, dia: number | null, unit = "mmHg") => (sys === null || dia === null ? null : `${sys}/${dia} ${unit}`);
const DESTINATION: Record<string, string> = { ward: "Ward", ccu: "CCU", icu: "ICU", day_case_recovery: "Day-case recovery", transferred: "Transferred" };
const PREVIOUS_PROCEDURES = new Set(["prior_pci", "prior_cabg"]);

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

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-700 first:mt-0">{children}</h3>;
}

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
    summaries: list.error ? null : list.data,
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

  const pt = p.patient;
  const vesselById = new Map(p.vessel_findings.map((v) => [v.id, v]));
  const previous = pt?.risk_factors.filter((r) => PREVIOUS_PROCEDURES.has(r.factor)) ?? [];
  const riskFactors = pt?.risk_factors.filter((r) => !PREVIOUS_PROCEDURES.has(r.factor)) ?? [];
  const duration = minutesBetween(p.started_at, p.ended_at);
  const timings = ["pre_procedure", "intra_procedure", "post_procedure"] as const;
  const during = p.complications.filter((c) => c.onset === "intraprocedural");
  const after = p.complications.filter((c) => c.onset === "inpatient");
  const untimed = p.complications.filter((c) => c.onset === null);

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
            <SubHeading>Previous procedures</SubHeading>
            {previous.length === 0 ? (
              <p className="text-slate-600">None recorded</p>
            ) : (
              <ul className="space-y-1">
                {previous.map((r) => (
                  <li key={r.id}>
                    {label(r.factor)}
                    {r.detail ? ` — ${r.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
            <SubHeading>Risk factors</SubHeading>
            {riskFactors.length === 0 ? (
              <p className="text-slate-600">None recorded</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {riskFactors.map((r) => (
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

      <Section title="Presentation and baseline">
        <Facts
          items={[
            ["Indication", en(p.indication)],
            ["Urgency", en(p.urgency)],
            ["Admitted", formatDateTime(p.admitted_at)],
            ["Referring clinician", p.referring_clinician],
            ["Troponin elevated", yesNo(p.troponin_elevated)],
            ["ECG", p.ecg_findings],
          ]}
        />
        <p className="mt-3 whitespace-pre-line">{orNotRecorded(p.presentation_notes)}</p>
        <SubHeading>Baseline</SubHeading>
        <Facts
          items={[
            ["Allergies", p.allergies],
            ["Creatinine", num(p.creatinine_umol_l, "µmol/L")],
            ["eGFR", num(p.egfr, "mL/min/1.73 m²")],
            ["Haemoglobin", num(p.haemoglobin_g_dl, "g/dL")],
            ["Platelets", num(p.platelets_x10e9_l, "×10⁹/L")],
            ["Blood pressure", pressure(p.baseline_bp_systolic, p.baseline_bp_diastolic)],
            ["Heart rate", num(p.baseline_heart_rate, "bpm")],
          ]}
        />
      </Section>

      <Section title="Access">
        <Facts
          items={[
            ["Access site", en(p.access_site)],
            ["Ultrasound-guided", yesNo(p.access_ultrasound_guided)],
            ["Attempts", p.access_attempts],
            ["Sheath", p.sheath_size_fr ? `${p.sheath_size_fr}F` : null],
            ["Diagnostic catheters", p.diagnostic_catheters.length ? p.diagnostic_catheters.join(", ") : null],
            ["Guiding catheter", p.guiding_catheter],
            ["Primary operator", p.operator ? `${p.operator.full_name} (${label(p.operator.role)})` : null],
            ["Sheath removed", p.sheath_removed_at ? formatDateTime(p.sheath_removed_at) : null],
          ]}
        />
      </Section>

      <Section title="Coronary anatomy">
        <Facts
          items={[
            ["Dominance", p.dominance ? (p.dominance === "co_dominant" ? "Co-dominant" : `${label(p.dominance)}-dominant`) : null],
            ["Aortic pressure", pressure(p.aortic_pressure_systolic, p.aortic_pressure_diastolic)],
            ["LVEDP", measurement(p.lvedp_status, `${p.lvedp_mmhg} mmHg`)],
          ]}
        />
        {p.vessel_findings.length === 0 ? (
          <p className="mt-3 text-slate-600">No findings recorded</p>
        ) : (
          <table className="mt-3 w-full table-fixed text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th scope="col" className="w-2/5 pb-2 font-medium">Vessel</th>
                <th scope="col" className="pb-2 font-medium">Stenosis</th>
                <th scope="col" className="pb-2 font-medium">Pre-intervention TIMI flow</th>
              </tr>
            </thead>
            <tbody>
              {p.vessel_findings.map((v) => {
                const detail = [
                  v.lesion_length_mm !== null ? `${v.lesion_length_mm} mm long` : null,
                  v.calcification ? `${label(v.calcification).toLowerCase()} calcification` : null,
                  v.thrombus ? "thrombus" : null,
                  v.bifurcation ? "bifurcation" : null,
                  v.lesion_notes,
                ].filter(Boolean);
                return (
                  <tr key={v.id} className={`border-t border-slate-100 align-top ${v.is_culprit ? "bg-red-50" : ""}`}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold">{lesionName(v.vessel, v.segment)}</span>
                      {v.is_culprit && <CulpritTag />}
                      {detail.length > 0 && <span className="block break-words text-xs text-slate-600">{detail.join(" · ")}</span>}
                    </td>
                    <td className="py-2">{v.stenosis_pct === 0 ? "0% (normal)" : `${v.stenosis_pct}%`}</td>
                    <td className="py-2">{timi(v.timi_flow)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Intervention and devices">
        {p.interventions.length === 0 ? (
          <p className="text-slate-600">{p.procedure_type === "diagnostic_angiography" ? "Diagnostic angiography only — no intervention." : "None recorded"}</p>
        ) : (
          <div className="space-y-5">
            {p.interventions.map((iv) => {
              const v = vesselById.get(iv.vessel_finding_id);
              return (
                <div key={iv.id} className="space-y-3">
                  <h3 className="font-semibold">
                    {v ? (
                      <>
                        {lesionName(v.vessel, v.segment)}
                        {v.is_culprit && <CulpritTag />}
                      </>
                    ) : (
                      NOT_RECORDED
                    )}
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
                              {(d.lot_number || d.expiry_date) && (
                                <span className="block font-mono text-xs">
                                  {[d.lot_number ? `Lot ${d.lot_number}` : null, d.expiry_date ? `Expiry ${formatDate(d.expiry_date)}` : null]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                              {d.udi && <span className="block break-all font-mono text-xs">UDI {d.udi}</span>}
                            </li>
                          )),
                      )}
                    </ol>
                  )}
                  {iv.notes && <p className="text-sm text-slate-700">{iv.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Procedure medications">
        {p.procedure_medications.length === 0 ? (
          <p className="text-slate-600">None recorded</p>
        ) : (
          timings.map((t) => {
            const meds = p.procedure_medications.filter((m) => m.timing === t);
            if (meds.length === 0) return null;
            return (
              <div key={t}>
                <SubHeading>{timingHeading(t)}</SubHeading>
                <ul className="divide-y divide-slate-100">
                  {meds.map((m) => (
                    <li key={m.id} className="py-2">
                      <span>{procedureMedicationLine(m)}</span>
                      <span className="block text-sm text-slate-600">
                        {[
                          m.administered_at ? `Given ${formatTime(m.administered_at)}` : null,
                          m.act_seconds !== null ? `ACT ${m.act_seconds} s${m.act_measured_at ? ` at ${formatTime(m.act_measured_at)}` : ""}` : null,
                          m.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Time not recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Procedure details">
        <SubHeading>Safety</SubHeading>
        <Facts
          items={[
            ["Consent", p.consent_obtained_at ? `${p.consent_by?.full_name ?? "Clinician not recorded"}, ${formatDateTime(p.consent_obtained_at)}` : null],
            ["Time-out", p.timeout_completed_at ? `${p.timeout_by?.full_name ?? "Clinician not recorded"}, ${formatDateTime(p.timeout_completed_at)}` : null],
          ]}
        />
        <SubHeading>Procedure</SubHeading>
        <Facts
          items={[
            ["Started", formatDateTime(p.started_at)],
            ["Ended", formatDateTime(p.ended_at)],
            ["Procedure duration", duration === null ? null : `${duration} min`],
            ["Contrast", [p.contrast_agent, num(p.contrast_volume_ml, "mL")].filter(Boolean).join(", ") || null],
            ["Fluoroscopy", num(p.fluoroscopy_time_min, "min")],
            ["Cumulative air kerma (mGy)", p.air_kerma_mgy],
            ["Dose-area product (Gy·cm²)", p.dap_gy_cm2],
            ["Haemostasis", en(p.haemostasis_method)],
          ]}
        />
        <SubHeading>Final impression</SubHeading>
        <p className="whitespace-pre-line">{orNotRecorded(p.outcome_summary)}</p>
      </Section>

      <Section title="Complications">
        {p.complications.length === 0 ? (
          <p>None</p>
        ) : (
          (
            [
              ["During procedure", during],
              ["After procedure", after],
              ["Timing not recorded", untimed],
            ] as const
          ).map(([heading, list]) =>
            list.length === 0 ? null : (
              <div key={heading}>
                <SubHeading>{heading}</SubHeading>
                <ul className="space-y-2">
                  {list.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold">{label(c.complication)}</span> ({label(c.severity)})
                      {c.onset_at && <span className="text-slate-700"> · {formatDateTime(c.onset_at)}</span>}
                      <span className="block">{c.management}</span>
                      {c.outcome && <span className="block text-sm text-slate-700">Outcome: {c.outcome}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )
        )}
      </Section>

      <Section title="Immediate outcome">
        <Facts
          items={[
            ["Condition", en(p.post_procedure_condition)],
            ["Destination", p.post_procedure_destination ? DESTINATION[p.post_procedure_destination] : null],
            ["LVEF", lvefText(p)],
          ]}
        />
        <SubHeading>Immediate post-procedure plan {p.ended_at && <span className="font-normal text-slate-600">· {formatDateTime(p.ended_at)}</span>}</SubHeading>
        <p className="whitespace-pre-line">{orNotRecorded(p.immediate_care_notes)}</p>
        <SubHeading>Communication</SubHeading>
        <Facts
          items={[
            ["Findings explained to patient", p.findings_communicated_to_patient_at ? formatDateTime(p.findings_communicated_to_patient_at) : null],
            ["Findings shared with team", p.findings_communicated_to_team ? "Yes" : "No"],
            ["Notes", p.communication_notes],
          ]}
        />
      </Section>

      <Section title="Discharge">
        {!p.discharge ? (
          <p className="font-medium">Not yet discharged</p>
        ) : (
          <div className="space-y-4">
            <Facts
              items={[
                ["Discharged", formatDateTime(p.discharge.discharged_at)],
                ["Length of stay", lengthOfStay(p.admitted_at, p.discharge.discharged_at)],
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
              {p.discharge.dapt_planned_months !== null && (
                <p className="mt-2 font-medium">
                  DAPT plan: {p.discharge.dapt_planned_months} {p.discharge.dapt_planned_months === 1 ? "month" : "months"}
                  {p.discharge.dapt_review_date && `, review by ${formatDate(p.discharge.dapt_review_date)}`}
                </p>
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
