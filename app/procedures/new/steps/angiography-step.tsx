"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, TIMI_LABELS, label } from "@/lib/labels";
import { newKey } from "@/lib/client-keys";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextInput } from "@/components/form/text-input";
import { CheckRow, Segmented } from "@/components/form/yes-no";
import { ErrorBanner, RemoveButton, StepActions, type StepState } from "@/components/form/form-status";
import { errorCount, useFocusFirstError } from "@/components/form/use-focus-first-error";
import { saveAngiographyStep } from "../actions";
import { SheetLink } from "@/components/report/sheets/sheet-link";
import { sheetHref } from "@/lib/sheets";

export type VesselRow = {
  key: string;
  id?: string;
  vessel: string;
  segment: string;
  stenosis_pct: string;
  timi_flow: string;
  is_culprit: boolean;
  lesion_notes: string;
  lesion_length_mm: string;
  calcification: string;
  thrombus: boolean;
  bifurcation: boolean;
};

export type MeasurementStatus = "not_recorded" | "not_performed" | "recorded";

/** Week 7: aortic pressure and LVEDP moved to the Haemodynamics & LV sheet (step 5). */
export type AnatomyValues = { dominance: string };

/**
 * treatedIds: saved vessel rows that an intervention (step 4) points at. showGrafts: the patient had
 * CABG, or grafts are recorded (spec §3.4).
 */
type Props = { procedureId: string; initial: VesselRow[]; anatomy: AnatomyValues; treatedIds: string[]; showGrafts: boolean; graftCount: number };

export const THREE_STATE = [
  { value: "recorded" as const, label: "Recorded" },
  { value: "not_performed" as const, label: "Not performed" },
  { value: "not_recorded" as const, label: "Not recorded" },
];

const TIMI_OPTIONS = TIMI_LABELS.map((l, i) => ({ value: String(i), label: `TIMI ${l}` }));

const blankVessel = (): VesselRow => ({
  key: newKey(), vessel: "", segment: "", stenosis_pct: "", timi_flow: "", is_culprit: false, lesion_notes: "",
  lesion_length_mm: "", calcification: "", thrombus: false, bifurcation: false,
});

export function AngiographyStep({ procedureId, initial, anatomy: initialAnatomy, treatedIds, showGrafts, graftCount }: Props) {
  const base = `/procedures/new?id=${procedureId}&step=3`;
  const [state, formAction] = useFormState<StepState, FormData>(saveAngiographyStep, {});
  useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};
  const [rows, setRows] = useState<VesselRow[]>(initial);
  const [anatomy, setAnatomy] = useState<AnatomyValues>(initialAnatomy);
  const setA = (k: keyof AnatomyValues) => (x: string) => setAnatomy((s) => ({ ...s, [k]: x }));

  const update = (key: string, patch: Partial<VesselRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // A normal vessel (0%) has no lesion: its lesion-only fields are hidden and saved empty.
  const isNormal = (r: VesselRow) => r.stenosis_pct.trim() === "0";
  const payload = {
    ...anatomy,
    vessels: rows.map(({ key: _key, ...r }) =>
      isNormal({ key: "", ...r })
        ? { ...r, is_culprit: false, lesion_length_mm: "", calcification: "", thrombus: false, bifurcation: false }
        : r,
    ),
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error ?? errors.vessels} />

      <section className="card space-y-3">
        <h2 className="font-semibold">Anatomy <span className="text-sm font-normal text-slate-600">(optional)</span></h2>
        <Field label="Coronary dominance" htmlFor="dominance">
          <EnumSelect id="dominance" value={anatomy.dominance} onChange={setA("dominance")} options={ENUMS.coronary_dominance} placeholder="—" />
        </Field>
        <p className="text-sm text-slate-600">Aortic pressure and LVEDP are recorded in Haemodynamics &amp; LV (step 5).</p>
        {showGrafts && (
          <SheetLink id="edit-grafts" href={sheetHref(base, "grafts")} className="btn-secondary min-h-11 text-sm">
            {graftCount ? `Bypass grafts (${graftCount})` : "+ Graft"}
          </SheetLink>
        )}
      </section>

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
                {/* A graft lesion names its graft (0011): it is added from the Grafts sheet, not here. */}
                <EnumSelect id={`v-${r.key}-vessel`} value={r.vessel} onChange={(x) => update(r.key, { vessel: x })} options={ENUMS.vessel.filter((v) => v !== "graft" || r.vessel === "graft")} invalid={!!e("vessel")} />
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
            {!isNormal(r) && (
              <>
                <CheckRow id={`v-${r.key}-culprit`} checked={r.is_culprit} onChange={(c) => update(r.key, { is_culprit: c })}>
                  Culprit lesion
                </CheckRow>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Lesion length (mm)" htmlFor={`v-${r.key}-len`} error={e("lesion_length_mm")}>
                    <TextInput id={`v-${r.key}-len`} inputMode="decimal" value={r.lesion_length_mm} onChange={(x) => update(r.key, { lesion_length_mm: x })} invalid={!!e("lesion_length_mm")} />
                  </Field>
                  <Field label="Calcification" htmlFor={`v-${r.key}-calc`}>
                    <EnumSelect id={`v-${r.key}-calc`} value={r.calcification} onChange={(x) => update(r.key, { calcification: x })} options={ENUMS.calcification_grade} placeholder="—" />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-x-6">
                  <CheckRow id={`v-${r.key}-thrombus`} checked={r.thrombus} onChange={(c) => update(r.key, { thrombus: c })}>Thrombus</CheckRow>
                  <CheckRow id={`v-${r.key}-bifurcation`} checked={r.bifurcation} onChange={(c) => update(r.key, { bifurcation: c })}>Bifurcation</CheckRow>
                </div>
              </>
            )}
            <Field label="Lesion notes (optional)" htmlFor={`v-${r.key}-notes`}>
              <TextInput id={`v-${r.key}-notes`} value={r.lesion_notes} onChange={(x) => update(r.key, { lesion_notes: x })} placeholder="Calcification, thrombus, bifurcation…" />
            </Field>
            {r.id ? (
              <SheetLink id={`edit-lesion-${r.id}`} href={sheetHref(base, "lesion", { row: r.id })} className="btn-secondary min-h-11 text-sm">
                Details — class, Medina, CTO, physiology…
              </SheetLink>
            ) : (
              <p className="text-xs text-slate-500">Save this step to add details (class, Medina, CTO, physiology, imaging).</p>
            )}
          </fieldset>
        );
      })}

      <button type="button" className="btn-secondary w-full" onClick={() => setRows((rs) => [...rs, blankVessel()])}>
        + Add vessel
      </button>

      <StepActions errorCount={errorCount(state)} backHref={`/procedures/new?id=${procedureId}&step=2`} />
    </form>
  );
}
