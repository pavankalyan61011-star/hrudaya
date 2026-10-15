"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS } from "@/lib/labels";
import { newKey } from "@/lib/client-keys";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextInput } from "@/components/form/text-input";
import { CheckRow, Segmented } from "@/components/form/yes-no";
import { ErrorBanner, RemoveButton, StepActions, type StepState } from "@/components/form/form-status";
import { saveDischargeStep } from "../actions";

export type MedicationRow = {
  key: string;
  drug_name: string;
  dose: string;
  dose_unit: string;
  frequency: string;
  route: string;
  duration: string;
  purpose: string;
  is_dapt: boolean;
};

export type DischargeValues = {
  admitted: boolean;
  discharge_date: string;
  length_of_stay_hours: string;
  clinical_status: string;
  follow_up_date: string;
  follow_up_clinic: string;
  advice: string[];
  red_flags: string[];
  medications: MedicationRow[];
};

type Props = { procedureId: string; initial: DischargeValues };

// From the reference case (docs/cases/PCI-2026-001.md); anything else can be added as "Other".
const ADVICE_OPTIONS = [
  "Strict DAPT adherence",
  "Smoking cessation",
  "Cardiac rehabilitation",
  "Heart-healthy diet",
  "Gradual return to physical activity",
  "Access-site care",
];
const RED_FLAG_OPTIONS = ["Recurrent chest pain", "Severe breathlessness", "Significant bleeding"];

const med = (drug_name: string, dose: string, frequency: string, is_dapt = false, purpose = ""): MedicationRow => ({
  key: newKey(), drug_name, dose, dose_unit: "mg", frequency, route: "oral", duration: "", purpose, is_dapt,
});

const DAPT_REGIMENS = [
  { label: "Aspirin + Ticagrelor", rows: () => [med("Aspirin", "75", "od", true, "Antiplatelet"), med("Ticagrelor", "90", "bd", true, "Antiplatelet")] },
  { label: "Aspirin + Clopidogrel", rows: () => [med("Aspirin", "75", "od", true, "Antiplatelet"), med("Clopidogrel", "75", "od", true, "Antiplatelet")] },
  { label: "Aspirin + Prasugrel", rows: () => [med("Aspirin", "75", "od", true, "Antiplatelet"), med("Prasugrel", "10", "od", true, "Antiplatelet")] },
];

function Checklist({ name, legend, options, value, onChange }: { name: string; legend: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [other, setOther] = useState("");
  const all = [...options, ...value.filter((x) => !options.includes(x))];
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">{legend}</legend>
      {all.map((opt, i) => (
        <CheckRow key={opt} id={`${name}-${i}`} checked={value.includes(opt)}
          onChange={(c) => onChange(c ? [...value, opt] : value.filter((x) => x !== opt))}>
          {opt}
        </CheckRow>
      ))}
      <div className="mt-2 flex gap-2">
        <label htmlFor={`${name}-other`} className="sr-only">Other {legend.toLowerCase()}</label>
        <input id={`${name}-other`} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other…" className="input" />
        <button type="button" className="btn-secondary shrink-0"
          onClick={() => {
            const t = other.trim();
            if (t && !value.includes(t)) onChange([...value, t]);
            setOther("");
          }}>
          Add<span className="sr-only"> to {legend.toLowerCase()}</span>
        </button>
      </div>
    </fieldset>
  );
}

export function DischargeStep({ procedureId, initial }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveDischargeStep, {});
  const errors = state.fieldErrors ?? {};
  const [v, setV] = useState<DischargeValues>(initial);
  const set = (k: "discharge_date" | "length_of_stay_hours" | "clinical_status" | "follow_up_date" | "follow_up_clinic") => (x: string) =>
    setV((s) => ({ ...s, [k]: x }));
  const setMed = (key: string, patch: Partial<MedicationRow>) =>
    setV((s) => ({ ...s, medications: s.medications.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));
  const e = (f: string) => errors[`discharge.${f}`];

  const { admitted, medications, ...rest } = v;
  const payload = admitted
    ? { admitted: true }
    : { admitted: false, discharge: { ...rest, medications: medications.map(({ key: _k, ...m }) => m) } };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error} />

      <section className="card">
        <Segmented name="admitted" legend="Patient status" value={v.admitted ? "admitted" : "discharged"}
          onChange={(x) => setV((s) => ({ ...s, admitted: x === "admitted" }))}
          options={[{ value: "discharged", label: "Discharged" }, { value: "admitted", label: "Still admitted" }]} />
        {v.admitted && <p className="mt-2 text-sm text-slate-600">The record will show “Not yet discharged”.</p>}
      </section>

      {!v.admitted && (
        <>
          <section className="card grid grid-cols-2 gap-3">
            <Field label="Discharge date" htmlFor="discharge_date" required error={e("discharge_date")}>
              <TextInput id="discharge_date" type="date" value={v.discharge_date} onChange={set("discharge_date")} invalid={!!e("discharge_date")} />
            </Field>
            <Field label="Length of stay (h)" htmlFor="los" required error={e("length_of_stay_hours")}>
              <TextInput id="los" inputMode="numeric" value={v.length_of_stay_hours} onChange={set("length_of_stay_hours")} invalid={!!e("length_of_stay_hours")} />
            </Field>
            <Field label="Clinical status" htmlFor="clinical_status" required error={e("clinical_status")} className="col-span-2">
              <TextInput id="clinical_status" value={v.clinical_status} onChange={set("clinical_status")} invalid={!!e("clinical_status")} placeholder="e.g. Clinically stable" />
            </Field>
            <Field label="Follow-up date" htmlFor="follow_up_date" required error={e("follow_up_date")}>
              <TextInput id="follow_up_date" type="date" value={v.follow_up_date} onChange={set("follow_up_date")} invalid={!!e("follow_up_date")} />
            </Field>
            <Field label="Follow-up clinic" htmlFor="follow_up_clinic" required error={e("follow_up_clinic")}>
              <TextInput id="follow_up_clinic" value={v.follow_up_clinic} onChange={set("follow_up_clinic")} invalid={!!e("follow_up_clinic")} />
            </Field>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Medications</h2>
            <div className="flex flex-wrap gap-2">
              {DAPT_REGIMENS.map((r) => (
                <button key={r.label} type="button" className="btn-secondary text-sm"
                  onClick={() => setV((s) => ({ ...s, medications: [...s.medications, ...r.rows()] }))}>
                  + {r.label}
                </button>
              ))}
            </div>
            {v.medications.map((m, i) => {
              const me = (f: string) => errors[`discharge.medications.${i}.${f}`];
              const id = (f: string) => `m-${m.key}-${f}`;
              return (
                <div key={m.key} className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-end gap-2">
                    <Field label="Drug" htmlFor={id("drug")} required error={me("drug_name")} className="flex-1">
                      <TextInput id={id("drug")} value={m.drug_name} onChange={(x) => setMed(m.key, { drug_name: x })} invalid={!!me("drug_name")} />
                    </Field>
                    <RemoveButton what={m.drug_name || `medication ${i + 1}`} onClick={() => setV((s) => ({ ...s, medications: s.medications.filter((x) => x.key !== m.key) }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Dose" htmlFor={id("dose")} required error={me("dose")}>
                      <TextInput id={id("dose")} inputMode="decimal" value={m.dose} onChange={(x) => setMed(m.key, { dose: x })} invalid={!!me("dose")} />
                    </Field>
                    <Field label="Unit" htmlFor={id("unit")} required error={me("dose_unit")}>
                      <EnumSelect id={id("unit")} value={m.dose_unit} onChange={(x) => setMed(m.key, { dose_unit: x })} options={ENUMS.dose_unit} invalid={!!me("dose_unit")} />
                    </Field>
                    <Field label="Frequency" htmlFor={id("freq")} required error={me("frequency")}>
                      <EnumSelect id={id("freq")} value={m.frequency} onChange={(x) => setMed(m.key, { frequency: x })} options={ENUMS.dose_frequency} invalid={!!me("frequency")} />
                    </Field>
                    <Field label="Route" htmlFor={id("route")} required error={me("route")}>
                      <EnumSelect id={id("route")} value={m.route} onChange={(x) => setMed(m.key, { route: x })} options={ENUMS.medication_route} invalid={!!me("route")} />
                    </Field>
                    <Field label="Duration" htmlFor={id("duration")}>
                      <TextInput id={id("duration")} value={m.duration} onChange={(x) => setMed(m.key, { duration: x })} placeholder="e.g. 12 months" />
                    </Field>
                    <Field label="Purpose" htmlFor={id("purpose")}>
                      <TextInput id={id("purpose")} value={m.purpose} onChange={(x) => setMed(m.key, { purpose: x })} />
                    </Field>
                  </div>
                  <CheckRow id={id("dapt")} checked={m.is_dapt} onChange={(c) => setMed(m.key, { is_dapt: c })}>
                    Part of DAPT (aspirin + P2Y12)
                  </CheckRow>
                </div>
              );
            })}
            <button type="button" className="btn-secondary w-full text-sm" onClick={() => setV((s) => ({ ...s, medications: [...s.medications, med("", "", "")] }))}>
              + Add medication
            </button>
          </section>

          <section className="card space-y-4">
            <Checklist name="advice" legend="Advice" options={ADVICE_OPTIONS} value={v.advice} onChange={(x) => setV((s) => ({ ...s, advice: x }))} />
            <Checklist name="redflags" legend="Red flags — seek emergency care" options={RED_FLAG_OPTIONS} value={v.red_flags} onChange={(x) => setV((s) => ({ ...s, red_flags: x }))} />
          </section>
        </>
      )}

      <StepActions backHref={`/procedures/new?id=${procedureId}&step=5`} nextLabel="Complete procedure" pendingLabel="Completing…" />
    </form>
  );
}
