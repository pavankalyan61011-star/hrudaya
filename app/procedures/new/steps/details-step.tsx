"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, label } from "@/lib/labels";
import { newKey } from "@/lib/client-keys";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextArea, TextInput } from "@/components/form/text-input";
import { CheckRow, Segmented } from "@/components/form/yes-no";
import { ErrorBanner, RemoveButton, StepActions, type StepState } from "@/components/form/form-status";
import { errorCount, useFocusFirstError } from "@/components/form/use-focus-first-error";
import { saveDetailsStep } from "../actions";
import { THREE_STATE, type MeasurementStatus } from "./angiography-step";

export type ComplicationRow = {
  key: string;
  /** Saved row: updated in place, so its Week 7 treatment, resolution and outcome links survive. */
  id?: string;
  complication: string;
  severity: string;
  management: string;
  onset: string;
  onset_at: string;
  outcome: string;
};

export type ProcedureMedRow = {
  key: string;
  drug_name: string;
  dose: string;
  dose_unit: string;
  route: string;
  timing: string;
  administered_at: string;
  act_seconds: string;
  act_measured_at: string;
  notes: string;
};

export type DetailsValues = {
  consent_obtained_at: string;
  consent_by_operator_id: string;
  timeout_completed_at: string;
  timeout_by_operator_id: string;
  started_at: string;
  ended_at: string;
  sheath_removed_at: string;
  contrast_agent: string;
  contrast_volume_ml: string;
  fluoroscopy_time_min: string;
  air_kerma_mgy: string;
  dap_gy_cm2: string;
  haemostasis_method: string;
  procedure_medications: ProcedureMedRow[];
  complications: ComplicationRow[];
  post_procedure_condition: string;
  post_procedure_destination: string;
  immediate_care_notes: string;
  lvef_status: MeasurementStatus;
  lvef_pct: string;
  lvef_source: string;
  lvef_measured_on: string;
  findings_communicated_to_patient_at: string;
  findings_communicated_to_team: boolean;
  communication_notes: string;
  outcome_summary: string;
};

/** stepSaved: this step was saved before, so zero complications then meant an explicit "None". */
type Props = { procedureId: string; initial: DetailsValues; operators: { id: string; full_name: string }[]; stepSaved: boolean };

/** ACT is only meaningful after an anticoagulant. */
const isAnticoagulant = (drug: string) => /heparin|bivalirudin|enoxaparin/i.test(drug);

const blankComplication = (): ComplicationRow => ({
  key: newKey(), complication: "", severity: "", management: "", onset: "", onset_at: "", outcome: "",
});

const pmed = (patch: Partial<ProcedureMedRow>): ProcedureMedRow => ({
  key: newKey(), drug_name: "", dose: "", dose_unit: "", route: "", timing: "", administered_at: "", act_seconds: "",
  act_measured_at: "", notes: "", ...patch,
});

// Quick-adds fill the drug and how it is given; the dose is typed by the operator except for
// the standard loading doses.
const QUICK_ADDS: { label: string; row: () => ProcedureMedRow }[] = [
  { label: "Heparin", row: () => pmed({ drug_name: "Unfractionated heparin", dose_unit: "units_per_kg", route: "iv", timing: "intra_procedure" }) },
  { label: "Ticagrelor 180 load", row: () => pmed({ drug_name: "Ticagrelor", dose: "180", dose_unit: "mg", route: "oral", timing: "pre_procedure", notes: "Loading dose" }) },
  { label: "Clopidogrel 600 load", row: () => pmed({ drug_name: "Clopidogrel", dose: "600", dose_unit: "mg", route: "oral", timing: "pre_procedure", notes: "Loading dose" }) },
  { label: "Prasugrel 60 load", row: () => pmed({ drug_name: "Prasugrel", dose: "60", dose_unit: "mg", route: "oral", timing: "pre_procedure", notes: "Loading dose" }) },
  { label: "Aspirin 300 load", row: () => pmed({ drug_name: "Aspirin", dose: "300", dose_unit: "mg", route: "oral", timing: "pre_procedure", notes: "Loading dose" }) },
];

function durationText(start: string, end: string) {
  if (!start || !end) return undefined;
  const min = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return min > 0 ? `Procedure duration ${min} min` : undefined;
}

export function DetailsStep({ procedureId, initial, operators, stepSaved }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveDetailsStep, {});
  useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};
  const [v, setV] = useState<DetailsValues>(initial);
  // No default: a new procedure starts with neither None nor Yes chosen.
  const [hasComplications, setHasComplications] = useState<"none" | "yes" | "">(
    initial.complications.length > 0 ? "yes" : stepSaved ? "none" : "",
  );
  type Scalar = Exclude<keyof DetailsValues, "complications" | "procedure_medications" | "findings_communicated_to_team" | "lvef_status">;
  const set = (k: Scalar) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const setComplication = (key: string, patch: Partial<ComplicationRow>) =>
    setV((s) => ({ ...s, complications: s.complications.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const setMed = (key: string, patch: Partial<ProcedureMedRow>) =>
    setV((s) => ({ ...s, procedure_medications: s.procedure_medications.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));
  const operatorOptions = operators.map((o) => ({ value: o.id, label: o.full_name }));

  const payload = {
    ...v,
    procedure_medications: v.procedure_medications.map(({ key: _k, ...m }) =>
      isAnticoagulant(m.drug_name) ? m : { ...m, act_seconds: "", act_measured_at: "" },
    ),
    complications_choice: hasComplications,
    complications: hasComplications === "yes" ? v.complications.map(({ key: _k, ...c }) => c) : [],
  };

  const dt = (k: Scalar, text: string, required = false, hint?: string) => (
    <Field label={text} htmlFor={k} required={required} error={errors[k]} hint={hint}>
      <TextInput id={k} type="datetime-local" value={v[k]} onChange={set(k)} invalid={!!errors[k]} />
    </Field>
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error} />
      <p className="text-sm text-slate-600">All times are India time (IST).</p>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Safety <span className="text-sm font-normal text-slate-600">(optional)</span></h2>
        {dt("consent_obtained_at", "Consent obtained")}
        <Field label="Consent taken by" htmlFor="consent_by">
          <EnumSelect id="consent_by" value={v.consent_by_operator_id} onChange={set("consent_by_operator_id")} options={operatorOptions} placeholder="—" />
        </Field>
        {dt("timeout_completed_at", "Time-out completed")}
        <Field label="Time-out led by" htmlFor="timeout_by">
          <EnumSelect id="timeout_by" value={v.timeout_by_operator_id} onChange={set("timeout_by_operator_id")} options={operatorOptions} placeholder="—" />
        </Field>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Timing</h2>
        {dt("started_at", "Procedure started", true)}
        {dt("ended_at", "Procedure ended", true, durationText(v.started_at, v.ended_at))}
        {dt("sheath_removed_at", "Sheath removed", false, "Optional")}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Procedure medications <span className="text-sm font-normal text-slate-600">(optional)</span></h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_ADDS.map((q) => (
            <button key={q.label} type="button" className="btn-secondary text-sm"
              onClick={() => setV((s) => ({ ...s, procedure_medications: [...s.procedure_medications, q.row()] }))}>
              + {q.label}
            </button>
          ))}
        </div>
        {v.procedure_medications.map((m, i) => {
          const me = (f: string) => errors[`procedure_medications.${i}.${f}`];
          const id = (f: string) => `pm-${m.key}-${f}`;
          return (
            <div key={m.key} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="flex items-end gap-2">
                <Field label="Drug" htmlFor={id("drug")} required error={me("drug_name")} className="flex-1">
                  <TextInput id={id("drug")} value={m.drug_name} onChange={(x) => setMed(m.key, { drug_name: x })} invalid={!!me("drug_name")} />
                </Field>
                <RemoveButton what={m.drug_name || `procedure medication ${i + 1}`}
                  onClick={() => setV((s) => ({ ...s, procedure_medications: s.procedure_medications.filter((x) => x.key !== m.key) }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dose" htmlFor={id("dose")} error={me("dose")}>
                  <TextInput id={id("dose")} inputMode="decimal" value={m.dose} onChange={(x) => setMed(m.key, { dose: x })} invalid={!!me("dose")} />
                </Field>
                <Field label="Unit" htmlFor={id("unit")} required={m.dose.trim() !== ""} error={me("dose_unit")}>
                  <EnumSelect id={id("unit")} value={m.dose_unit} onChange={(x) => setMed(m.key, { dose_unit: x })} options={ENUMS.dose_unit} invalid={!!me("dose_unit")} />
                </Field>
                <Field label="Route" htmlFor={id("route")} required error={me("route")}>
                  <EnumSelect id={id("route")} value={m.route} onChange={(x) => setMed(m.key, { route: x })} options={ENUMS.medication_route} invalid={!!me("route")} />
                </Field>
                <Field label="When" htmlFor={id("timing")} required error={me("timing")}>
                  <EnumSelect id={id("timing")} value={m.timing} onChange={(x) => setMed(m.key, { timing: x })} options={ENUMS.medication_timing} invalid={!!me("timing")} />
                </Field>
                <Field label="Given at" htmlFor={id("at")} error={me("administered_at")} className="col-span-2">
                  <TextInput id={id("at")} type="datetime-local" value={m.administered_at} onChange={(x) => setMed(m.key, { administered_at: x })} invalid={!!me("administered_at")} />
                </Field>
                {isAnticoagulant(m.drug_name) && (
                  <>
                    <Field label="ACT after dose (s)" htmlFor={id("act")} error={me("act_seconds")}>
                      <TextInput id={id("act")} inputMode="numeric" value={m.act_seconds} onChange={(x) => setMed(m.key, { act_seconds: x })} invalid={!!me("act_seconds")} />
                    </Field>
                    <Field label="ACT measured at" htmlFor={id("actat")} error={me("act_measured_at")}>
                      <TextInput id={id("actat")} type="datetime-local" value={m.act_measured_at} onChange={(x) => setMed(m.key, { act_measured_at: x })} invalid={!!me("act_measured_at")} />
                    </Field>
                  </>
                )}
              </div>
              <Field label="Notes" htmlFor={id("notes")}>
                <TextInput id={id("notes")} value={m.notes} onChange={(x) => setMed(m.key, { notes: x })} placeholder="e.g. Loading dose, for no-reflow" />
              </Field>
            </div>
          );
        })}
        <button type="button" className="btn-secondary w-full text-sm" onClick={() => setV((s) => ({ ...s, procedure_medications: [...s.procedure_medications, pmed({})] }))}>
          + Add procedure medication
        </button>
      </section>

      <section className="card grid grid-cols-2 gap-3">
        <h2 className="col-span-2 font-semibold">Contrast, radiation and haemostasis</h2>
        <Field label="Contrast agent" htmlFor="contrast_agent" hint="Optional" className="col-span-2">
          <TextInput id="contrast_agent" value={v.contrast_agent} onChange={set("contrast_agent")} placeholder="e.g. Iohexol 350" />
        </Field>
        <Field label="Contrast (mL)" htmlFor="contrast" required error={errors.contrast_volume_ml}>
          <TextInput id="contrast" inputMode="numeric" value={v.contrast_volume_ml} onChange={set("contrast_volume_ml")} invalid={!!errors.contrast_volume_ml} />
        </Field>
        <Field label="Fluoroscopy (min)" htmlFor="fluoro" required error={errors.fluoroscopy_time_min}>
          <TextInput id="fluoro" inputMode="decimal" value={v.fluoroscopy_time_min} onChange={set("fluoroscopy_time_min")} invalid={!!errors.fluoroscopy_time_min} />
        </Field>
        <Field label="Air kerma (mGy)" htmlFor="kerma" hint="Optional" error={errors.air_kerma_mgy}>
          <TextInput id="kerma" inputMode="decimal" value={v.air_kerma_mgy} onChange={set("air_kerma_mgy")} invalid={!!errors.air_kerma_mgy} />
        </Field>
        <Field label="DAP (Gy·cm²)" htmlFor="dap" hint="Optional" error={errors.dap_gy_cm2}>
          <TextInput id="dap" inputMode="decimal" value={v.dap_gy_cm2} onChange={set("dap_gy_cm2")} invalid={!!errors.dap_gy_cm2} />
        </Field>
        <Field label="Haemostasis" htmlFor="haemostasis" required error={errors.haemostasis_method} className="col-span-2">
          <EnumSelect id="haemostasis" value={v.haemostasis_method} onChange={set("haemostasis_method")} options={ENUMS.haemostasis_method} invalid={!!errors.haemostasis_method} />
        </Field>
      </section>

      <section className="card space-y-3">
        <Segmented name="complications" legend="Complications" value={hasComplications} required error={errors.complications_choice}
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
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Severity" htmlFor={`c-${c.key}-sev`} required error={e("severity")}>
                      <EnumSelect id={`c-${c.key}-sev`} value={c.severity} onChange={(x) => setComplication(c.key, { severity: x })} options={ENUMS.complication_severity} invalid={!!e("severity")} />
                    </Field>
                    <Field label="Onset" htmlFor={`c-${c.key}-onset`}>
                      <EnumSelect id={`c-${c.key}-onset`} value={c.onset} onChange={(x) => setComplication(c.key, { onset: x })} options={ENUMS.complication_onset} placeholder="—" />
                    </Field>
                    <Field label="Onset time" htmlFor={`c-${c.key}-onsetat`} error={e("onset_at")} className="col-span-2">
                      <TextInput id={`c-${c.key}-onsetat`} type="datetime-local" value={c.onset_at} onChange={(x) => setComplication(c.key, { onset_at: x })} invalid={!!e("onset_at")} />
                    </Field>
                  </div>
                  <Field label="Management" htmlFor={`c-${c.key}-mgmt`} required error={e("management")}>
                    <TextArea id={`c-${c.key}-mgmt`} rows={2} value={c.management} onChange={(x) => setComplication(c.key, { management: x })} invalid={!!e("management")} />
                  </Field>
                  <Field label="Outcome" htmlFor={`c-${c.key}-outcome`} hint="Optional">
                    <TextInput id={`c-${c.key}-outcome`} value={c.outcome} onChange={(x) => setComplication(c.key, { outcome: x })} placeholder="e.g. Resolved, TIMI III restored" />
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

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Immediate outcome</h2>
        <Field label="Condition" htmlFor="condition" required error={errors.post_procedure_condition}>
          <EnumSelect id="condition" value={v.post_procedure_condition} onChange={set("post_procedure_condition")} options={ENUMS.post_procedure_condition}
            invalid={!!errors.post_procedure_condition} />
        </Field>
        <Field label="Destination" htmlFor="destination" required error={errors.post_procedure_destination}>
          <EnumSelect id="destination" value={v.post_procedure_destination} onChange={set("post_procedure_destination")} invalid={!!errors.post_procedure_destination}
            options={ENUMS.post_procedure_destination.map((d) => ({ value: d, label: d === "ccu" ? "CCU" : d === "icu" ? "ICU" : label(d) }))} />
        </Field>
        <Field label="Immediate post-procedure plan" htmlFor="care_notes" className="sm:col-span-2">
          <TextArea id="care_notes" rows={2} value={v.immediate_care_notes} onChange={set("immediate_care_notes")} />
        </Field>
        <div className="sm:col-span-2">
          <Segmented name="lvef_status" legend="LVEF" value={v.lvef_status} onChange={(x) => setV((s) => ({ ...s, lvef_status: x }))} options={THREE_STATE} />
        </div>
        {v.lvef_status === "recorded" && (
          <>
            <Field label="LVEF %" htmlFor="lvef" required error={errors.lvef_pct}>
              <TextInput id="lvef" inputMode="numeric" value={v.lvef_pct} onChange={set("lvef_pct")} invalid={!!errors.lvef_pct} />
            </Field>
            <Field label="Measured by" htmlFor="lvef_source">
              <EnumSelect id="lvef_source" value={v.lvef_source} onChange={set("lvef_source")} options={ENUMS.lvef_source} placeholder="—" />
            </Field>
            <Field label="Measured on" htmlFor="lvef_on">
              <TextInput id="lvef_on" type="date" value={v.lvef_measured_on} onChange={set("lvef_measured_on")} />
            </Field>
          </>
        )}
        {dt("findings_communicated_to_patient_at", "Findings explained to patient")}
        <div className="flex items-end">
          <CheckRow id="team" checked={v.findings_communicated_to_team} onChange={(c) => setV((s) => ({ ...s, findings_communicated_to_team: c }))}>
            Findings communicated to the team
          </CheckRow>
        </div>
        <Field label="Communication notes" htmlFor="comm_notes" className="sm:col-span-2">
          <TextInput id="comm_notes" value={v.communication_notes} onChange={set("communication_notes")} />
        </Field>
      </section>

      <section className="card">
        <Field label="Final impression" htmlFor="outcome" required error={errors.outcome_summary}>
          <TextArea id="outcome" rows={4} value={v.outcome_summary} onChange={set("outcome_summary")} invalid={!!errors.outcome_summary}
            placeholder="e.g. Successful transradial PCI to proximal LAD with a single DES. Final TIMI III, 0% residual. No complications." />
        </Field>
      </section>

      <StepActions errorCount={errorCount(state)} backHref={`/procedures/new?id=${procedureId}&step=4`} />
    </form>
  );
}
