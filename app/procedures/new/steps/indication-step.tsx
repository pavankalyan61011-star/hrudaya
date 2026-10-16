"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, SHEATH_SIZES, label } from "@/lib/labels";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextArea, TextInput } from "@/components/form/text-input";
import { Segmented } from "@/components/form/yes-no";
import { ErrorBanner, StepActions, type StepState } from "@/components/form/form-status";
import { errorCount, useFocusFirstError } from "@/components/form/use-focus-first-error";
import { saveIndicationStep } from "../actions";

type YesNoUnknown = "yes" | "no" | "unknown";

export type IndicationValues = {
  case_code: string;
  procedure_date: string;
  procedure_type: string;
  indication: string;
  urgency: string;
  facility_id: string;
  referring_clinician: string;
  admitted_at: string; // datetime-local, IST
  presentation_notes: string;
  ecg_findings: string;
  troponin: YesNoUnknown;
  allergies: string;
  creatinine_umol_l: string;
  egfr: string;
  haemoglobin_g_dl: string;
  platelets_x10e9_l: string;
  baseline_bp_systolic: string;
  baseline_bp_diastolic: string;
  baseline_heart_rate: string;
  access_site: string;
  access_ultrasound: YesNoUnknown;
  access_attempts: string;
  sheath_size_fr: string;
  diagnostic_catheters: string; // comma-separated in the form
  guiding_catheter: string;
  primary_operator_id: string;
};

type Props = {
  procedureId: string;
  initial: IndicationValues;
  operators: { id: string; full_name: string; role: string }[];
  facilities: { id: string; name: string; cath_lab_name: string; city: string }[];
  /** Week 6: during an amendment the case code and procedure date are shown but cannot change. */
  identityLocked?: boolean;
};

const AUTO_CODE = /^(PCI|CAG)-(\d{4}-\d{3,})$/;
const YES_NO_UNKNOWN = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
  { value: "unknown" as const, label: "Not recorded" },
];

export function IndicationStep({ procedureId, initial, operators, facilities, identityLocked = false }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveIndicationStep, {});
  useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};
  const [v, setV] = useState<IndicationValues>(initial);
  const set = (k: keyof IndicationValues) => (value: string) => setV((s) => ({ ...s, [k]: value }));

  // Case codes follow the seed: CAG- for diagnostic-only, PCI- otherwise. Only an
  // auto-format code is switched; a code the user typed differently is left alone.
  function setType(type: string) {
    setV((s) => {
      const m = AUTO_CODE.exec(s.case_code);
      const prefix = type === "diagnostic_angiography" ? "CAG" : "PCI";
      // During an amendment the case code is locked, whatever the type becomes.
      return { ...s, procedure_type: type, case_code: m && type && !identityLocked ? `${prefix}-${m[2]}` : s.case_code };
    });
  }

  const num = (k: keyof IndicationValues, labelText: string, decimal = true) => (
    <Field label={labelText} htmlFor={k} error={errors[k]}>
      <TextInput id={k} inputMode={decimal ? "decimal" : "numeric"} value={v[k]} onChange={set(k)} invalid={!!errors[k]} />
    </Field>
  );

  const payload = {
    ...v,
    diagnostic_catheters: v.diagnostic_catheters.split(",").map((c) => c.trim()).filter(Boolean),
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error} />

      <section className="card grid gap-4 sm:grid-cols-2">
        <Field label="Facility" htmlFor="facility_id" required error={errors.facility_id} className="sm:col-span-2">
          <EnumSelect id="facility_id" value={v.facility_id} onChange={set("facility_id")} invalid={!!errors.facility_id}
            options={facilities.map((f) => ({ value: f.id, label: `${f.name} — ${f.cath_lab_name}, ${f.city}` }))} />
        </Field>
        {identityLocked ? (
          <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              <span className="text-slate-600">Procedure date:</span> <span className="font-medium">{v.procedure_date}</span>
              {" · "}
              <span className="text-slate-600">Case code:</span> <span className="font-mono font-medium">{v.case_code}</span>
            </p>
            <p className="mt-1 text-slate-600"><span aria-hidden>🔒 </span>Locked during an amendment.</p>
          </div>
        ) : (
          <>
            <Field label="Procedure date" htmlFor="procedure_date" required error={errors.procedure_date}>
              <TextInput id="procedure_date" type="date" value={v.procedure_date} onChange={set("procedure_date")} invalid={!!errors.procedure_date} />
            </Field>
            <Field label="Case code" htmlFor="case_code" required error={errors.case_code}>
              <TextInput id="case_code" value={v.case_code} onChange={set("case_code")} invalid={!!errors.case_code} />
            </Field>
          </>
        )}
        <Field label="Procedure type" htmlFor="procedure_type" required error={errors.procedure_type}>
          <EnumSelect id="procedure_type" value={v.procedure_type} onChange={setType} options={ENUMS.procedure_type} invalid={!!errors.procedure_type} />
        </Field>
        <Field label="Indication" htmlFor="indication" required error={errors.indication}>
          <EnumSelect id="indication" value={v.indication} onChange={set("indication")} options={ENUMS.indication} invalid={!!errors.indication} />
        </Field>
        <Field label="Urgency" htmlFor="urgency" required error={errors.urgency}>
          <EnumSelect id="urgency" value={v.urgency} onChange={set("urgency")} options={ENUMS.urgency} invalid={!!errors.urgency} />
        </Field>
        <Field label="Admitted (India time)" htmlFor="admitted_at" hint="Optional" error={errors.admitted_at}>
          <TextInput id="admitted_at" type="datetime-local" value={v.admitted_at} onChange={set("admitted_at")} invalid={!!errors.admitted_at} />
        </Field>
        <Field label="Referring clinician" htmlFor="referring_clinician" hint="Optional" className="sm:col-span-2">
          <TextInput id="referring_clinician" value={v.referring_clinician} onChange={set("referring_clinician")} />
        </Field>
        <Field label="Presentation" htmlFor="presentation_notes" required error={errors.presentation_notes} className="sm:col-span-2">
          <TextArea id="presentation_notes" value={v.presentation_notes} onChange={set("presentation_notes")} invalid={!!errors.presentation_notes}
            placeholder="e.g. Central chest pain radiating to left arm for 2 days…" />
        </Field>
        <Field label="ECG findings (optional)" htmlFor="ecg_findings" className="sm:col-span-2">
          <TextInput id="ecg_findings" value={v.ecg_findings} onChange={set("ecg_findings")} placeholder="e.g. ST depression V4–V6" />
        </Field>
        <div className="sm:col-span-2">
          <Segmented name="troponin" legend="Troponin" value={v.troponin} onChange={(t) => setV((s) => ({ ...s, troponin: t }))}
            options={[{ value: "yes", label: "Elevated" }, { value: "no", label: "Not elevated" }, { value: "unknown", label: "Not known" }]} />
        </div>
      </section>

      <section className="card grid grid-cols-2 gap-3">
        <h2 className="col-span-2 font-semibold">Baseline <span className="text-sm font-normal text-slate-600">(all optional)</span></h2>
        <Field label="Allergies" htmlFor="allergies" className="col-span-2">
          <TextInput id="allergies" value={v.allergies} onChange={set("allergies")} placeholder="e.g. None known" />
        </Field>
        {num("creatinine_umol_l", "Creatinine (µmol/L)")}
        {num("egfr", "eGFR (mL/min/1.73 m²)")}
        {num("haemoglobin_g_dl", "Haemoglobin (g/dL)")}
        {num("platelets_x10e9_l", "Platelets (×10⁹/L)", false)}
        {num("baseline_bp_systolic", "BP systolic (mmHg)", false)}
        {num("baseline_bp_diastolic", "BP diastolic (mmHg)", false)}
        {num("baseline_heart_rate", "Heart rate (bpm)", false)}
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Access</h2>
        <Field label="Access site" htmlFor="access_site" required error={errors.access_site}>
          <EnumSelect id="access_site" value={v.access_site} onChange={set("access_site")} options={ENUMS.access_site} invalid={!!errors.access_site} />
        </Field>
        <Field label="Sheath size" htmlFor="sheath_size_fr" required error={errors.sheath_size_fr}>
          <EnumSelect id="sheath_size_fr" value={v.sheath_size_fr} onChange={set("sheath_size_fr")}
            options={SHEATH_SIZES.map((s) => ({ value: String(s), label: `${s}F` }))} invalid={!!errors.sheath_size_fr} />
        </Field>
        <div className="sm:col-span-2">
          <Segmented name="access_ultrasound" legend="Ultrasound-guided access" value={v.access_ultrasound}
            onChange={(x) => setV((s) => ({ ...s, access_ultrasound: x }))} options={YES_NO_UNKNOWN} />
        </div>
        <Field label="Access attempts" htmlFor="access_attempts" hint="Optional" error={errors.access_attempts}>
          <TextInput id="access_attempts" inputMode="numeric" value={v.access_attempts} onChange={set("access_attempts")} invalid={!!errors.access_attempts} />
        </Field>
        <Field label="Diagnostic catheters" htmlFor="diagnostic_catheters" hint="Separate with commas, e.g. 5F TIG" error={errors.diagnostic_catheters}>
          <TextInput id="diagnostic_catheters" value={v.diagnostic_catheters} onChange={set("diagnostic_catheters")} />
        </Field>
        <Field label="Guiding catheter (optional)" htmlFor="guiding_catheter">
          <TextInput id="guiding_catheter" value={v.guiding_catheter} onChange={set("guiding_catheter")} placeholder="e.g. 6F EBU 3.5" />
        </Field>
        <Field label="Primary operator" htmlFor="primary_operator_id" required error={errors.primary_operator_id} className="sm:col-span-2">
          <EnumSelect id="primary_operator_id" value={v.primary_operator_id} onChange={set("primary_operator_id")}
            options={operators.map((o) => ({ value: o.id, label: `${o.full_name} — ${label(o.role)}` }))} invalid={!!errors.primary_operator_id} />
        </Field>
      </section>

      <StepActions errorCount={errorCount(state)} backHref={`/procedures/new?id=${procedureId}&step=1`} />
    </form>
  );
}
