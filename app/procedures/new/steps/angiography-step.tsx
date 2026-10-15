"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, TIMI_LABELS, label } from "@/lib/labels";
import { newKey } from "@/lib/client-keys";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextInput } from "@/components/form/text-input";
import { CheckRow } from "@/components/form/yes-no";
import { ErrorBanner, RemoveButton, StepActions, type StepState } from "@/components/form/form-status";
import { saveAngiographyStep } from "../actions";

export type VesselRow = {
  key: string;
  id?: string;
  vessel: string;
  segment: string;
  stenosis_pct: string;
  timi_flow: string;
  is_culprit: boolean;
  lesion_notes: string;
};

/** treatedIds: saved vessel rows that an intervention (step 4) points at. */
type Props = { procedureId: string; initial: VesselRow[]; treatedIds: string[] };

const TIMI_OPTIONS = TIMI_LABELS.map((l, i) => ({ value: String(i), label: `TIMI ${l}` }));

const blankVessel = (): VesselRow => ({
  key: newKey(), vessel: "", segment: "", stenosis_pct: "", timi_flow: "", is_culprit: false, lesion_notes: "",
});

export function AngiographyStep({ procedureId, initial, treatedIds }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveAngiographyStep, {});
  const errors = state.fieldErrors ?? {};
  const [rows, setRows] = useState<VesselRow[]>(initial);

  const update = (key: string, patch: Partial<VesselRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const payload = { vessels: rows.map(({ key: _key, ...r }) => r) };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error ?? errors.vessels} />

      {rows.map((r, i) => {
        const e = (f: string) => errors[`vessels.${i}.${f}`];
        const title = r.vessel ? label(r.vessel) : `Vessel ${i + 1}`;
        return (
          <fieldset key={r.key} className="card space-y-3">
            <div className="flex items-center justify-between">
              <legend className="text-lg font-semibold">{title}</legend>
              <div className="flex gap-1">
                <button type="button" className="btn-secondary min-h-11 px-3 text-sm"
                  onClick={() => update(r.key, { stenosis_pct: "0", timi_flow: "3", is_culprit: false })}>
                  Normal<span className="sr-only"> — set {title} to 0% and TIMI III</span>
                </button>
                <RemoveButton
                  what={title}
                  onClick={() => {
                    if (r.id && treatedIds.includes(r.id) && !window.confirm(`${title} has an intervention recorded in step 4. Removing it removes that intervention too when you save.`)) return;
                    setRows((rs) => rs.filter((x) => x.key !== r.key));
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vessel" htmlFor={`v-${r.key}-vessel`} required error={e("vessel")}>
                <EnumSelect id={`v-${r.key}-vessel`} value={r.vessel} onChange={(x) => update(r.key, { vessel: x })} options={ENUMS.vessel} invalid={!!e("vessel")} />
              </Field>
              <Field label="Segment" htmlFor={`v-${r.key}-segment`}>
                <EnumSelect id={`v-${r.key}-segment`} value={r.segment} onChange={(x) => update(r.key, { segment: x })} options={ENUMS.vessel_segment} placeholder="—" />
              </Field>
              <Field label="Stenosis %" htmlFor={`v-${r.key}-stenosis`} required error={e("stenosis_pct")}>
                <TextInput id={`v-${r.key}-stenosis`} inputMode="numeric" value={r.stenosis_pct} onChange={(x) => update(r.key, { stenosis_pct: x })} invalid={!!e("stenosis_pct")} placeholder="0–100" />
              </Field>
              <Field label="TIMI flow" htmlFor={`v-${r.key}-timi`} required error={e("timi_flow")}>
                <EnumSelect id={`v-${r.key}-timi`} value={r.timi_flow} onChange={(x) => update(r.key, { timi_flow: x })} options={TIMI_OPTIONS} invalid={!!e("timi_flow")} />
              </Field>
            </div>
            <CheckRow id={`v-${r.key}-culprit`} checked={r.is_culprit} onChange={(c) => update(r.key, { is_culprit: c })}>
              Culprit lesion
            </CheckRow>
            <Field label="Lesion notes (optional)" htmlFor={`v-${r.key}-notes`}>
              <TextInput id={`v-${r.key}-notes`} value={r.lesion_notes} onChange={(x) => update(r.key, { lesion_notes: x })} placeholder="Calcification, thrombus, bifurcation…" />
            </Field>
          </fieldset>
        );
      })}

      <button type="button" className="btn-secondary w-full" onClick={() => setRows((rs) => [...rs, blankVessel()])}>
        + Add vessel
      </button>

      <StepActions backHref={`/procedures/new?id=${procedureId}&step=2`} />
    </form>
  );
}
