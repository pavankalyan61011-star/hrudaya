import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProcedureFull } from "@/lib/queries/procedures";
import { listOperators } from "@/lib/queries/operators";
import { listFacilities } from "@/lib/queries/facilities";
import { ageOn, toISTInput, todayIST } from "@/lib/dates";
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
  // Completed and reviewed records are never edited through the form.
  if (p.status !== "draft") redirect(`/procedures/${p.id}`);

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
      const [{ operators }, { facilities }] = await Promise.all([listOperators(db), listFacilities(db)]);
      const yesNoUnknown = (b: boolean | null) => (b === null ? "unknown" : b ? "yes" : "no") as "yes" | "no" | "unknown";
      return (
        <>
          {header}
          <IndicationStep
            procedureId={p.id}
            operators={operators}
            facilities={facilities}
            initial={{
              case_code: p.case_code,
              procedure_date: p.procedure_date ?? today,
              procedure_type: p.procedure_type ?? "",
              indication: p.indication ?? "",
              urgency: p.urgency ?? "",
              // One cath lab in Week 1 scope: pre-select it when it is the only facility.
              facility_id: p.facility_id ?? (facilities.length === 1 ? facilities[0].id : ""),
              referring_clinician: p.referring_clinician ?? "",
              admitted_at: toISTInput(p.admitted_at),
              presentation_notes: p.presentation_notes ?? "",
              ecg_findings: p.ecg_findings ?? "",
              troponin: yesNoUnknown(p.troponin_elevated),
              allergies: p.allergies ?? "",
              creatinine_umol_l: str(p.creatinine_umol_l),
              egfr: str(p.egfr),
              haemoglobin_g_dl: str(p.haemoglobin_g_dl),
              platelets_x10e9_l: str(p.platelets_x10e9_l),
              baseline_bp_systolic: str(p.baseline_bp_systolic),
              baseline_bp_diastolic: str(p.baseline_bp_diastolic),
              baseline_heart_rate: str(p.baseline_heart_rate),
              access_site: p.access_site ?? "",
              access_ultrasound: yesNoUnknown(p.access_ultrasound_guided),
              access_attempts: str(p.access_attempts),
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
        lesion_length_mm: str(v.lesion_length_mm), calcification: v.calcification ?? "", thrombus: v.thrombus, bifurcation: v.bifurcation,
      }));
      const initial: VesselRow[] =
        saved.length > 0
          ? saved
          : PREFILLED_VESSELS.map((vessel) => ({
              key: `pre-${vessel}`, vessel, segment: "", stenosis_pct: "", timi_flow: "", is_culprit: false, lesion_notes: "",
              lesion_length_mm: "", calcification: "", thrombus: false, bifurcation: false,
            }));
      return (
        <>
          {header}
          <AngiographyStep
            procedureId={p.id}
            initial={initial}
            anatomy={{
              dominance: p.dominance ?? "",
              aortic_pressure_systolic: str(p.aortic_pressure_systolic),
              aortic_pressure_diastolic: str(p.aortic_pressure_diastolic),
              lvedp_status: p.lvedp_status,
              lvedp_mmhg: str(p.lvedp_mmhg),
            }}
            treatedIds={p.interventions.map((i) => i.vessel_finding_id)}
          />
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
          length_mm: str(d.length_mm), inflation_atm: str(d.inflation_atm), lot_number: d.lot_number ?? "",
          expiry_date: d.expiry_date ?? "", udi: d.udi ?? "", quantity: str(d.quantity),
        })),
      }));
      return (
        <>
          {header}
          <InterventionStep procedureId={p.id} diagnosticOnly={p.procedure_type === "diagnostic_angiography"} lesions={lesions} initial={initial} />
        </>
      );
    }

    case 5: {
      const { operators } = await listOperators(db);
      return (
        <>
          {header}
          <DetailsStep
            procedureId={p.id}
            operators={operators}
            stepSaved={p.started_at !== null}
            initial={{
              consent_obtained_at: toISTInput(p.consent_obtained_at),
              consent_by_operator_id: p.consent_by_operator_id ?? "",
              timeout_completed_at: toISTInput(p.timeout_completed_at),
              timeout_by_operator_id: p.timeout_by_operator_id ?? "",
              started_at: toISTInput(p.started_at),
              ended_at: toISTInput(p.ended_at),
              sheath_removed_at: toISTInput(p.sheath_removed_at),
              contrast_agent: p.contrast_agent ?? "",
              contrast_volume_ml: str(p.contrast_volume_ml),
              fluoroscopy_time_min: str(p.fluoroscopy_time_min),
              air_kerma_mgy: str(p.air_kerma_mgy),
              dap_gy_cm2: str(p.dap_gy_cm2),
              haemostasis_method: p.haemostasis_method ?? "",
              procedure_medications: p.procedure_medications.map((m) => ({
                key: m.id, drug_name: m.drug_name, dose: str(m.dose), dose_unit: m.dose_unit ?? "", route: m.route, timing: m.timing,
                administered_at: toISTInput(m.administered_at), act_seconds: str(m.act_seconds), act_measured_at: toISTInput(m.act_measured_at),
                notes: m.notes ?? "",
              })),
              complications: p.complications.map((c) => ({
                key: c.id, complication: c.complication, severity: c.severity, management: c.management,
                onset: c.onset ?? "", onset_at: toISTInput(c.onset_at), outcome: c.outcome ?? "",
              })),
              post_procedure_condition: p.post_procedure_condition ?? "",
              post_procedure_destination: p.post_procedure_destination ?? "",
              immediate_care_notes: p.immediate_care_notes ?? "",
              lvef_status: p.lvef_status,
              lvef_pct: str(p.lvef_pct),
              lvef_source: p.lvef_source ?? "",
              lvef_measured_on: p.lvef_measured_on ?? "",
              findings_communicated_to_patient_at: toISTInput(p.findings_communicated_to_patient_at),
              findings_communicated_to_team: p.findings_communicated_to_team,
              communication_notes: p.communication_notes ?? "",
              outcome_summary: p.outcome_summary ?? "",
            }}
          />
        </>
      );
    }

    default: {
      const d = p.discharge;
      return (
        <>
          {header}
          <DischargeStep
            procedureId={p.id}
            initial={{
              admitted: false,
              discharged_at: toISTInput(d?.discharged_at),
              dapt_planned_months: str(d?.dapt_planned_months),
              dapt_review_date: d?.dapt_review_date ?? "",
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
