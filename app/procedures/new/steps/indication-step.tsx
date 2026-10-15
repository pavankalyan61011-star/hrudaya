"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, SHEATH_SIZES, label } from "@/lib/labels";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextArea, TextInput } from "@/components/form/text-input";
import { Segmented } from "@/components/form/yes-no";
import { ErrorBanner, StepActions, type StepState } from "@/components/form/form-status";
import { saveIndicationStep } from "../actions";

export type IndicationValues = {
  case_code: string;
  procedure_date: string;
  procedure_type: string;
  indication: string;
  presentation_notes: string;
  ecg_findings: string;
  troponin: "yes" | "no" | "unknown";
  access_site: string;
  sheath_size_fr: string;
  diagnostic_catheters: string; // comma-separated in the form
  guiding_catheter: string;
  primary_operator_id: string;
};

type Props = {
  procedureId: string;
  initial: IndicationValues;
  operators: { id: string; full_name: string; role: string }[];
};

const AUTO_CODE = /^(PCI|CAG)-(\d{4}-\d{3,})$/;

export function IndicationStep({ procedureId, initial, operators }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveIndicationStep, {});
  const errors = state.fieldErrors ?? {};
  const [v, setV] = useState<IndicationValues>(initial);
  const set = (k: keyof IndicationValues) => (value: string) => setV((s) => ({ ...s, [k]: value }));

  // Case codes follow the seed: CAG- for diagnostic-only, PCI- otherwise. Only an
  // auto-format code is switched; a code the user typed differently is left alone.
  function setType(type: string) {
    setV((s) => {
      const m = AUTO_CODE.exec(s.case_code);
      const prefix = type === "diagnostic_angiography" ? "CAG" : "PCI";
      return { ...s, procedure_type: type, case_code: m && type ? `${prefix}-${m[2]}` : s.case_code };
    });
  }

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
        <Field label="Procedure date" htmlFor="procedure_date" required error={errors.procedure_date}>
          <TextInput id="procedure_date" type="date" value={v.procedure_date} onChange={set("procedure_date")} invalid={!!errors.procedure_date} />
        </Field>
        <Field label="Case code" htmlFor="case_code" required error={errors.case_code}>
          <TextInput id="case_code" value={v.case_code} onChange={set("case_code")} invalid={!!errors.case_code} />
        </Field>
        <Field label="Procedure type" htmlFor="procedure_type" required error={errors.procedure_type}>
          <EnumSelect id="procedure_type" value={v.procedure_type} onChange={setType} options={ENUMS.procedure_type} invalid={!!errors.procedure_type} />
        </Field>
        <Field label="Indication" htmlFor="indication" required error={errors.indication}>
          <EnumSelect id="indication" value={v.indication} onChange={set("indication")} options={ENUMS.indication} invalid={!!errors.indication} />
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

      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Access</h2>
        <Field label="Access site" htmlFor="access_site" required error={errors.access_site}>
          <EnumSelect id="access_site" value={v.access_site} onChange={set("access_site")} options={ENUMS.access_site} invalid={!!errors.access_site} />
        </Field>
        <Field label="Sheath size" htmlFor="sheath_size_fr" required error={errors.sheath_size_fr}>
          <EnumSelect id="sheath_size_fr" value={v.sheath_size_fr} onChange={set("sheath_size_fr")}
            options={SHEATH_SIZES.map((s) => ({ value: String(s), label: `${s}F` }))} invalid={!!errors.sheath_size_fr} />
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

      <StepActions backHref={`/procedures/new?id=${procedureId}&step=1`} />
    </form>
  );
}
