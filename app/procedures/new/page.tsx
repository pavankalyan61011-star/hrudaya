import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull } from "@/lib/queries/procedures";
import { listOperators } from "@/lib/queries/operators";
import { ageOn, todayIST } from "@/lib/dates";
import { label } from "@/lib/labels";
import { StepHeader } from "./step-header";
import { PatientStep } from "./steps/patient-step";
import { IndicationStep } from "./steps/indication-step";
import { AngiographyStep, type VesselRow } from "./steps/angiography-step";
import { InterventionStep, type InterventionRow } from "./steps/intervention-step";
import { DetailsStep } from "./steps/details-step";
import { DischargeStep } from "./steps/discharge-step";

export const dynamic = "force-dynamic";

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
const PREFILLED_VESSELS = ["lmca", "lad", "lcx", "rca"] as const;

type SearchParams = { id?: string; step?: string };

export default async function NewProcedurePage({ searchParams }: { searchParams: SearchParams }) {
  const today = todayIST();
  const step = Math.min(6, Math.max(1, Number(searchParams.step) || 1));

  if (!searchParams.id) {
    return (
      <>
        <StepHeader step={1} procedureId={null} />
        <PatientStep procedureId={null} today={today} initialPatient={null} />
      </>
    );
  }

  const db = createClient();
  const { procedure: p } = await getProcedureFull(db, searchParams.id);
  if (!p) notFound();
  if (p.status === "completed") redirect(`/procedures/${p.id}`);

  const patient = p.patient;
  const patientLabel = patient
    ? `${patient.full_name}, ${ageOn(patient.date_of_birth, p.procedure_date ?? today)} ${patient.sex === "male" ? "M" : patient.sex === "female" ? "F" : ""}`.trim()
    : undefined;
  const header = <StepHeader step={step} procedureId={p.id} caseCode={p.case_code} patientLabel={patientLabel} />;

  switch (step) {
    case 1:
      return (
        <>
          {header}
          <PatientStep
            procedureId={p.id}
            today={today}
            initialPatient={
              patient
                ? {
                    id: patient.id, mrn: patient.mrn, full_name: patient.full_name, sex: patient.sex, date_of_birth: patient.date_of_birth,
                    risk_factors: patient.risk_factors.map((r) => ({ factor: r.factor, detail: r.detail })),
                  }
                : null
            }
          />
        </>
      );

    case 2: {
      const { operators } = await listOperators(db);
      return (
        <>
          {header}
          <IndicationStep
            procedureId={p.id}
            operators={operators}
            initial={{
              case_code: p.case_code,
              procedure_date: p.procedure_date ?? today,
              procedure_type: p.procedure_type ?? "",
              indication: p.indication ?? "",
              presentation_notes: p.presentation_notes ?? "",
              ecg_findings: p.ecg_findings ?? "",
              troponin: p.troponin_elevated === null ? "unknown" : p.troponin_elevated ? "yes" : "no",
              access_site: p.access_site ?? "",
              sheath_size_fr: str(p.sheath_size_fr),
              diagnostic_catheters: p.diagnostic_catheters.join(", "),
              guiding_catheter: p.guiding_catheter ?? "",
              primary_operator_id: p.primary_operator_id ?? "",
            }}
          />
        </>
      );
    }

    case 3: {
      const saved: VesselRow[] = p.vessel_findings.map((v) => ({
        key: v.id, id: v.id, vessel: v.vessel, segment: v.segment ?? "", stenosis_pct: str(v.stenosis_pct),
        timi_flow: str(v.timi_flow), is_culprit: v.is_culprit, lesion_notes: v.lesion_notes ?? "",
      }));
      const initial: VesselRow[] =
        saved.length > 0
          ? saved
          : PREFILLED_VESSELS.map((vessel) => ({
              key: `pre-${vessel}`, vessel, segment: "", stenosis_pct: "", timi_flow: "", is_culprit: false, lesion_notes: "",
            }));
      return (
        <>
          {header}
          <AngiographyStep procedureId={p.id} initial={initial} treatedIds={p.interventions.map((i) => i.vessel_finding_id)} />
        </>
      );
    }

    case 4: {
      const lesions = p.vessel_findings.map((v) => ({
        id: v.id,
        label: [label(v.vessel), v.segment ? label(v.segment).toLowerCase() : null, `${v.stenosis_pct}%`].filter(Boolean).join(" "),
        is_culprit: v.is_culprit,
      }));
      const initial: InterventionRow[] = p.interventions.map((i) => ({
        key: i.id, vessel_finding_id: i.vessel_finding_id, intervention_type: i.intervention_type, guidewire: i.guidewire,
        residual_stenosis_pct: str(i.residual_stenosis_pct), timi_flow_post: str(i.timi_flow_post),
        success: i.success, dissection: i.dissection, perforation: i.perforation, notes: i.notes ?? "",
        devices: i.devices_used.map((d) => ({
          key: d.id, phase: d.phase, category: d.category, product_name: d.product_name, diameter_mm: str(d.diameter_mm),
          length_mm: str(d.length_mm), inflation_atm: str(d.inflation_atm), lot_number: d.lot_number ?? "", quantity: str(d.quantity),
        })),
      }));
      return (
        <>
          {header}
          <InterventionStep procedureId={p.id} diagnosticOnly={p.procedure_type === "diagnostic_angiography"} lesions={lesions} initial={initial} />
        </>
      );
    }

    case 5:
      return (
        <>
          {header}
          <DetailsStep
            procedureId={p.id}
            initial={{
              contrast_volume_ml: str(p.contrast_volume_ml),
              procedure_duration_min: str(p.procedure_duration_min),
              fluoroscopy_time_min: str(p.fluoroscopy_time_min),
              radiation_dose_mgy: str(p.radiation_dose_mgy),
              lvef_pct: str(p.lvef_pct),
              haemostasis_method: p.haemostasis_method ?? "",
              outcome_summary: p.outcome_summary ?? "",
              complications: p.complications.map((c) => ({ key: c.id, complication: c.complication, severity: c.severity, management: c.management })),
            }}
          />
        </>
      );

    default: {
      const d = p.discharge;
      return (
        <>
          {header}
          <DischargeStep
            procedureId={p.id}
            initial={{
              admitted: false,
              discharge_date: d?.discharge_date ?? "",
              length_of_stay_hours: str(d?.length_of_stay_hours),
              clinical_status: d?.clinical_status ?? "",
              follow_up_date: d?.follow_up_date ?? "",
              follow_up_clinic: d?.follow_up_clinic ?? "Cardiology OPD",
              advice: d?.advice ?? [],
              red_flags: d?.red_flags ?? [],
              medications: (d?.discharge_medications ?? []).map((m) => ({
                key: m.id, drug_name: m.drug_name, dose: str(m.dose), dose_unit: m.dose_unit ?? "", frequency: m.frequency, route: m.route,
                duration: m.duration ?? "", purpose: m.purpose ?? "", is_dapt: m.is_dapt,
              })),
            }}
          />
        </>
      );
    }
  }
}
