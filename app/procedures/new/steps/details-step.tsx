"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS } from "@/lib/labels";
import { newKey } from "@/lib/client-keys";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextArea, TextInput } from "@/components/form/text-input";
import { Segmented } from "@/components/form/yes-no";
import { ErrorBanner, RemoveButton, StepActions, type StepState } from "@/components/form/form-status";
import { saveDetailsStep } from "../actions";

export type ComplicationRow = { key: string; complication: string; severity: string; management: string };

export type DetailsValues = {
  contrast_volume_ml: string;
  procedure_duration_min: string;
  fluoroscopy_time_min: string;
  radiation_dose_mgy: string;
  lvef_pct: string;
  haemostasis_method: string;
  outcome_summary: string;
  complications: ComplicationRow[];
};

type Props = { procedureId: string; initial: DetailsValues };

const blankComplication = (): ComplicationRow => ({ key: newKey(), complication: "", severity: "", management: "" });

export function DetailsStep({ procedureId, initial }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveDetailsStep, {});
  const errors = state.fieldErrors ?? {};
  const [v, setV] = useState<DetailsValues>(initial);
  const [hasComplications, setHasComplications] = useState<"none" | "yes">(initial.complications.length > 0 ? "yes" : "none");
  const set = (k: Exclude<keyof DetailsValues, "complications">) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const setComplication = (key: string, patch: Partial<ComplicationRow>) =>
    setV((s) => ({ ...s, complications: s.complications.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  const payload = {
    ...v,
    complications: hasComplications === "none" ? [] : v.complications.map(({ key: _k, ...c }) => c),
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error} />

      <section className="card grid grid-cols-2 gap-3">
        <Field label="Contrast (mL)" htmlFor="contrast" required error={errors.contrast_volume_ml}>
          <TextInput id="contrast" inputMode="numeric" value={v.contrast_volume_ml} onChange={set("contrast_volume_ml")} invalid={!!errors.contrast_volume_ml} />
        </Field>
        <Field label="Duration (min)" htmlFor="duration" required error={errors.procedure_duration_min}>
          <TextInput id="duration" inputMode="numeric" value={v.procedure_duration_min} onChange={set("procedure_duration_min")} invalid={!!errors.procedure_duration_min} />
        </Field>
        <Field label="Fluoroscopy (min)" htmlFor="fluoro" required error={errors.fluoroscopy_time_min}>
          <TextInput id="fluoro" inputMode="decimal" value={v.fluoroscopy_time_min} onChange={set("fluoroscopy_time_min")} invalid={!!errors.fluoroscopy_time_min} />
        </Field>
        <Field label="Radiation dose (mGy)" htmlFor="dose" hint="Optional" error={errors.radiation_dose_mgy}>
          <TextInput id="dose" inputMode="decimal" value={v.radiation_dose_mgy} onChange={set("radiation_dose_mgy")} invalid={!!errors.radiation_dose_mgy} />
        </Field>
        <Field label="LVEF %" htmlFor="lvef" hint="Optional, if recorded" error={errors.lvef_pct}>
          <TextInput id="lvef" inputMode="numeric" value={v.lvef_pct} onChange={set("lvef_pct")} invalid={!!errors.lvef_pct} />
        </Field>
        <Field label="Haemostasis" htmlFor="haemostasis" required error={errors.haemostasis_method}>
          <EnumSelect id="haemostasis" value={v.haemostasis_method} onChange={set("haemostasis_method")} options={ENUMS.haemostasis_method} invalid={!!errors.haemostasis_method} />
        </Field>
      </section>

      <section className="card space-y-3">
        <Segmented name="complications" legend="Complications" value={hasComplications}
          onChange={(x) => {
            setHasComplications(x);
            if (x === "yes" && v.complications.length === 0) setV((s) => ({ ...s, complications: [blankComplication()] }));
          }}
          options={[{ value: "none", label: "None" }, { value: "yes", label: "Yes" }]} />
        {hasComplications === "yes" && (
          <>
            {v.complications.map((c, i) => {
              const e = (f: string) => errors[`complications.${i}.${f}`];
              return (
                <div key={c.key} className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-end gap-2">
                    <Field label="Complication" htmlFor={`c-${c.key}-type`} required error={e("complication")} className="flex-1">
                      <EnumSelect id={`c-${c.key}-type`} value={c.complication} onChange={(x) => setComplication(c.key, { complication: x })} options={ENUMS.complication_type} invalid={!!e("complication")} />
                    </Field>
                    <RemoveButton what={`complication ${i + 1}`} onClick={() => setV((s) => ({ ...s, complications: s.complications.filter((x) => x.key !== c.key) }))} />
                  </div>
                  <Field label="Severity" htmlFor={`c-${c.key}-sev`} required error={e("severity")}>
                    <EnumSelect id={`c-${c.key}-sev`} value={c.severity} onChange={(x) => setComplication(c.key, { severity: x })} options={ENUMS.complication_severity} invalid={!!e("severity")} />
                  </Field>
                  <Field label="Management" htmlFor={`c-${c.key}-mgmt`} required error={e("management")}>
                    <TextArea id={`c-${c.key}-mgmt`} rows={2} value={c.management} onChange={(x) => setComplication(c.key, { management: x })} invalid={!!e("management")} />
                  </Field>
                </div>
              );
            })}
            <button type="button" className="btn-secondary w-full text-sm" onClick={() => setV((s) => ({ ...s, complications: [...s.complications, blankComplication()] }))}>
              + Add complication
            </button>
          </>
        )}
      </section>

      <section className="card">
        <Field label="Final impression" htmlFor="outcome" required error={errors.outcome_summary}>
          <TextArea id="outcome" rows={4} value={v.outcome_summary} onChange={set("outcome_summary")} invalid={!!errors.outcome_summary}
            placeholder="e.g. Successful transradial PCI to proximal LAD with a single DES. Final TIMI III, 0% residual. No complications." />
        </Field>
      </section>

      <StepActions backHref={`/procedures/new?id=${procedureId}&step=4`} />
    </form>
  );
}
