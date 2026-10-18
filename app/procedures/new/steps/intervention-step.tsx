"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, TIMI_LABELS, label, type Enums } from "@/lib/labels";
import { newKey } from "@/lib/client-keys";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextInput } from "@/components/form/text-input";
import { CheckRow, Segmented } from "@/components/form/yes-no";
import { ErrorBanner, RemoveButton, StepActions, type StepState } from "@/components/form/form-status";
import { errorCount, useFocusFirstError } from "@/components/form/use-focus-first-error";
import { saveInterventionStep } from "../actions";

export type DeviceRow = {
  key: string;
  /** Saved row: updated in place, so its inflation log (Week 7) survives a re-save. */
  id?: string;
  phase: Enums["device_phase"];
  category: string;
  product_name: string;
  diameter_mm: string;
  length_mm: string;
  inflation_atm: string;
  lot_number: string;
  expiry_date: string;
  udi: string;
  quantity: string;
};

export type InterventionRow = {
  key: string;
  /** Saved row: updated in place, so its Week 7 detail and events survive a re-save. */
  id?: string;
  vessel_finding_id: string;
  intervention_type: string;
  guidewire: string;
  residual_stenosis_pct: string;
  timi_flow_post: string;
  success: boolean | null; // null = not chosen yet; never defaulted
  dissection: boolean;
  perforation: boolean;
  notes: string;
  devices: DeviceRow[];
};

type Lesion = { id: string; label: string; is_culprit: boolean };

type Props = {
  procedureId: string;
  diagnosticOnly: boolean;
  lesions: Lesion[];
  initial: InterventionRow[];
};

const GROUPS: { phase: Enums["device_phase"]; title: string; add: string; defaultCategory: Enums["device_category"] }[] = [
  { phase: "pre_dilation", title: "Pre-dilation", add: "Add pre-dilation balloon", defaultCategory: "balloon_sc" },
  { phase: "deployment", title: "Stent / deployment", add: "Add stent", defaultCategory: "stent" },
  { phase: "post_dilation", title: "Post-dilation", add: "Add post-dilation balloon", defaultCategory: "balloon_nc" },
  { phase: "other", title: "Other devices", add: "Add other device", defaultCategory: "other" },
];

const TIMI_OPTIONS = TIMI_LABELS.map((l, i) => ({ value: String(i), label: `TIMI ${l}` }));

const blankDevice = (phase: Enums["device_phase"], category: string): DeviceRow => ({
  key: newKey(), phase, category, product_name: "", diameter_mm: "", length_mm: "", inflation_atm: "", lot_number: "", expiry_date: "", udi: "", quantity: "1",
});

const blankIntervention = (lesionId: string): InterventionRow => ({
  key: newKey(), vessel_finding_id: lesionId, intervention_type: "", guidewire: "", residual_stenosis_pct: "", timi_flow_post: "",
  success: null, dissection: false, perforation: false, notes: "", devices: [],
});

/** Everything a device row needs before it can fold away into a one-line summary. */
const deviceComplete = (d: DeviceRow) =>
  !!d.category && !!d.product_name.trim() && !!d.diameter_mm.trim() && !!d.length_mm.trim() && !!d.quantity.trim() &&
  (d.category !== "stent" || !!d.lot_number.trim());

function deviceSummary(d: DeviceRow) {
  const atm = d.inflation_atm.trim() ? ` @ ${d.inflation_atm} atm` : "";
  const qty = d.quantity.trim() && d.quantity.trim() !== "1" ? ` ×${d.quantity}` : "";
  const lot = d.lot_number.trim() ? ` · Lot ${d.lot_number.trim()}` : "";
  return `${d.product_name} ${d.diameter_mm} × ${d.length_mm} mm${atm}${qty}${lot}`;
}

export function InterventionStep({ procedureId, diagnosticOnly, lesions, initial }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(saveInterventionStep, {});
  useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};
  const culprit = lesions.find((l) => l.is_culprit)?.id ?? "";
  const [items, setItems] = useState<InterventionRow[]>(
    initial.length > 0 ? initial : diagnosticOnly ? [] : [blankIntervention(culprit)],
  );

  // Saved rows that are already complete start folded; new rows start open.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(initial.flatMap((it) => it.devices.filter(deviceComplete).map((d) => d.key))),
  );
  const fold = (key: string, on: boolean) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const updateItem = (key: string, patch: Partial<InterventionRow>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const updateDevice = (itemKey: string, devKey: string, patch: Partial<DeviceRow>) =>
    setItems((xs) =>
      xs.map((x) => (x.key === itemKey ? { ...x, devices: x.devices.map((d) => (d.key === devKey ? { ...d, ...patch } : d)) } : x)),
    );

  const payload = {
    interventions: diagnosticOnly
      ? []
      : items.map(({ key: _k, devices, ...x }) => ({ ...x, devices: devices.map(({ key: _dk, ...d }) => d) })),
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error} />

      {diagnosticOnly ? (
        <div className="card space-y-2">
          <p className="font-semibold">Diagnostic angiography only — no intervention.</p>
          <p className="text-sm text-slate-600">To record a PCI, change the procedure type in step 2.</p>
          {initial.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              An intervention was recorded earlier. Saving this step removes it.
            </p>
          )}
        </div>
      ) : lesions.length === 0 ? (
        <div className="card text-sm">Add the angiography findings in step 3 first — the treated lesion is picked from them.</div>
      ) : (
        items.map((it, i) => {
          const e = (f: string) => errors[`interventions.${i}.${f}`];
          return (
            <fieldset key={it.key} className="card space-y-4">
              <div className="flex items-center justify-between">
                <legend className="text-lg font-semibold">Treated lesion {items.length > 1 ? i + 1 : ""}</legend>
                {items.length > 1 && <RemoveButton what={`treated lesion ${i + 1}`} onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} />}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lesion treated" htmlFor={`i-${it.key}-lesion`} required error={e("vessel_finding_id")}>
                  <EnumSelect id={`i-${it.key}-lesion`} value={it.vessel_finding_id} onChange={(x) => updateItem(it.key, { vessel_finding_id: x })}
                    options={lesions.map((l) => ({ value: l.id, label: l.label + (l.is_culprit ? " (culprit)" : "") }))} invalid={!!e("vessel_finding_id")} />
                </Field>
                <Field label="Intervention type" htmlFor={`i-${it.key}-type`} required error={e("intervention_type")}>
                  <EnumSelect id={`i-${it.key}-type`} value={it.intervention_type} onChange={(x) => updateItem(it.key, { intervention_type: x })}
                    options={ENUMS.intervention_type} invalid={!!e("intervention_type")} />
                </Field>
                <Field label="Guidewire" htmlFor={`i-${it.key}-wire`} required error={e("guidewire")} className="sm:col-span-2">
                  <TextInput id={`i-${it.key}-wire`} value={it.guidewire} onChange={(x) => updateItem(it.key, { guidewire: x })} invalid={!!e("guidewire")} placeholder="e.g. BMW Universal II 0.014" />
                </Field>
              </div>

              {GROUPS.map((g) => {
                const rows = it.devices.map((d, idx) => ({ d, idx })).filter(({ d }) => d.phase === g.phase);
                return (
                  <div key={g.phase} className="space-y-2 border-t border-slate-200 pt-3">
                    <h3 className="font-semibold">{g.title}</h3>
                    {rows.map(({ d, idx }) => {
                      const de = (f: string) => errors[`interventions.${i}.devices.${idx}.${f}`];
                      const id = (f: string) => `d-${d.key}-${f}`;
                      const isStent = d.category === "stent";
                      const hasError = Object.keys(errors).some((k) => k.startsWith(`interventions.${i}.devices.${idx}.`));
                      if (collapsed.has(d.key) && deviceComplete(d) && !hasError) {
                        return (
                          <div key={d.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 pl-3">
                            <p className="min-w-0 break-words text-sm">
                              <span className="font-medium">{label(d.category)}</span> · {deviceSummary(d)}
                            </p>
                            <button type="button" className="btn-secondary shrink-0 px-3 text-sm" onClick={() => fold(d.key, false)}>
                              Edit<span className="sr-only"> {d.product_name}</span>
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={d.key}
                          className="space-y-3 rounded-lg border border-slate-200 p-3"
                          onBlur={(ev) => {
                            // Fold once complete and focus has left the row.
                            if (!ev.currentTarget.contains(ev.relatedTarget as Node | null) && deviceComplete(d)) fold(d.key, true);
                          }}
                        >
                          <div className="flex items-end gap-2">
                            <Field label="Device" htmlFor={id("category")} required error={de("category")} className="flex-1">
                              <EnumSelect id={id("category")} value={d.category} onChange={(x) => updateDevice(it.key, d.key, { category: x })} options={ENUMS.device_category} invalid={!!de("category")} />
                            </Field>
                            <RemoveButton what={`${label(d.category)} from ${g.title}`} onClick={() => updateItem(it.key, { devices: it.devices.filter((x) => x.key !== d.key) })} />
                          </div>
                          <Field label="Product name" htmlFor={id("product")} required error={de("product_name")}>
                            <TextInput id={id("product")} value={d.product_name} onChange={(x) => updateDevice(it.key, d.key, { product_name: x })} invalid={!!de("product_name")}
                              placeholder={isStent ? "e.g. Xience Skypoint DES" : "e.g. Semi-compliant balloon"} />
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Diameter (mm)" htmlFor={id("dia")} required error={de("diameter_mm")}>
                              <TextInput id={id("dia")} inputMode="decimal" value={d.diameter_mm} onChange={(x) => updateDevice(it.key, d.key, { diameter_mm: x })} invalid={!!de("diameter_mm")} />
                            </Field>
                            <Field label="Length (mm)" htmlFor={id("len")} required error={de("length_mm")}>
                              <TextInput id={id("len")} inputMode="decimal" value={d.length_mm} onChange={(x) => updateDevice(it.key, d.key, { length_mm: x })} invalid={!!de("length_mm")} />
                            </Field>
                            <Field label="Pressure (atm)" htmlFor={id("atm")} error={de("inflation_atm")}>
                              <TextInput id={id("atm")} inputMode="numeric" value={d.inflation_atm} onChange={(x) => updateDevice(it.key, d.key, { inflation_atm: x })} invalid={!!de("inflation_atm")} />
                            </Field>
                            <Field label="Quantity" htmlFor={id("qty")} required error={de("quantity")}>
                              <TextInput id={id("qty")} inputMode="numeric" value={d.quantity} onChange={(x) => updateDevice(it.key, d.key, { quantity: x })} invalid={!!de("quantity")} />
                            </Field>
                          </div>
                          <Field label="Lot number" htmlFor={id("lot")} required={isStent} error={de("lot_number")}
                            hint={isStent ? "Required for every stent" : "Optional for this device"}>
                            <input id={id("lot")} value={d.lot_number} required={isStent}
                              onChange={(ev) => updateDevice(it.key, d.key, { lot_number: ev.target.value })}
                              aria-invalid={!!de("lot_number") || undefined} aria-describedby={de("lot_number") ? `${id("lot")}-error` : undefined}
                              autoComplete="off" autoCapitalize="characters" className={`input font-mono ${de("lot_number") ? "border-red-600" : ""}`} />
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Expiry date" htmlFor={id("exp")} hint="Optional" error={de("expiry_date")}>
                              <TextInput id={id("exp")} type="date" value={d.expiry_date} onChange={(x) => updateDevice(it.key, d.key, { expiry_date: x })} invalid={!!de("expiry_date")} />
                            </Field>
                            <Field label="UDI" htmlFor={id("udi")} hint="Optional">
                              <TextInput id={id("udi")} value={d.udi} onChange={(x) => updateDevice(it.key, d.key, { udi: x })} />
                            </Field>
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" className="btn-secondary w-full text-sm"
                      onClick={() => updateItem(it.key, { devices: [...it.devices, blankDevice(g.phase, g.defaultCategory)] })}>
                      + {g.add}
                    </button>
                  </div>
                );
              })}

              <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                <Field label="Residual stenosis %" htmlFor={`i-${it.key}-resid`} required error={e("residual_stenosis_pct")}>
                  <TextInput id={`i-${it.key}-resid`} inputMode="numeric" value={it.residual_stenosis_pct} onChange={(x) => updateItem(it.key, { residual_stenosis_pct: x })} invalid={!!e("residual_stenosis_pct")} />
                </Field>
                <Field label="TIMI flow after" htmlFor={`i-${it.key}-timi`} required error={e("timi_flow_post")}>
                  <EnumSelect id={`i-${it.key}-timi`} value={it.timi_flow_post} onChange={(x) => updateItem(it.key, { timi_flow_post: x })} options={TIMI_OPTIONS} invalid={!!e("timi_flow_post")} />
                </Field>
              </div>
              <Segmented name={`i-${it.key}-success`} legend="Result" required error={e("success")}
                value={it.success === null ? "" : it.success ? "yes" : "no"}
                onChange={(x) => updateItem(it.key, { success: x === "yes" })}
                options={[{ value: "yes", label: "Successful" }, { value: "no", label: "Not successful" }]} />
              <div>
                <CheckRow id={`i-${it.key}-dissection`} checked={it.dissection} onChange={(c) => updateItem(it.key, { dissection: c })}>Dissection</CheckRow>
                <CheckRow id={`i-${it.key}-perforation`} checked={it.perforation} onChange={(c) => updateItem(it.key, { perforation: c })}>Perforation</CheckRow>
              </div>
              <Field label="Notes (optional)" htmlFor={`i-${it.key}-notes`}>
                <TextInput id={`i-${it.key}-notes`} value={it.notes} onChange={(x) => updateItem(it.key, { notes: x })} />
              </Field>
            </fieldset>
          );
        })
      )}

      {!diagnosticOnly && lesions.length > 0 && (
        <button type="button" className="btn-secondary w-full" onClick={() => setItems((xs) => [...xs, blankIntervention("")])}>
          + Add another treated lesion
        </button>
      )}

      <StepActions errorCount={errorCount(state)} backHref={`/procedures/new?id=${procedureId}&step=3`} />
    </form>
  );
}
