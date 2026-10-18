"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, label, type Enums } from "@/lib/labels";
import { toISTInput } from "@/lib/dates";
import { OUTCOME_KEYS, OUTCOME_LABEL, SUGGESTED_OUTCOME, type OutcomeKey } from "@/lib/events";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/form/form-status";
import { saveIndicationSheet, saveOutcomeSheet, type SheetState } from "@/app/procedures/[id]/sheets/actions";
import { Sheet, useCloseSheet } from "./sheet";
import { Chips, Choice, DateTimeField, NumberWithUnit, RegistryLegend, TriState, YesNo, YesNoUnknown } from "./fields";

type Tri = Enums["tri_state"];
type Tab = "indication" | "outcome";

export type IndicationInitial = {
  indication: string | null;
  ccs_class: number | null;
  nyha_class: number | null;
  stress_test_type: string | null;
  stress_test_result: string | null;
  cardiogenic_shock: boolean;
  cardiac_arrest_pre_procedure: boolean;
  thrombolysis_given: boolean;
  prior_pci: boolean | null;
  prior_cabg: boolean | null;
  symptom_onset_at: string | null;
  first_medical_contact_at: string | null;
  door_at: string | null;
  device_time_at: string | null;
};

export type OutcomeInitial = Record<OutcomeKey, Tri> & {
  death_cause: string | null;
  bleeding_barc: number | null;
  bleeding_barc_sub: string | null;
  vascular_complications: Enums["vascular_complication"][];
  creatinine_post_umol_l: number | null;
  disposition: string | null;
};

export type LinkedEvent = { id: string; complication: Enums["complication_type"]; onset_at: string | null; treatments: string[] };

const str = (n: number | null) => (n === null ? "" : String(n));
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));

/** Door-to-device in minutes, derived (spec §2.10: displayed, never stored). */
function doorToDevice(door: string, device: string) {
  if (!door || !device) return null;
  const m = Math.round((Date.parse(`${device}:00+05:30`) - Date.parse(`${door}:00+05:30`)) / 60_000);
  return Number.isFinite(m) && m >= 0 ? m : null;
}

/** §3.6 Indication & outcome: two tabs, each saved on its own. */
export function IndicationSheet({
  procedureId,
  tab,
  tabHref,
  indication,
  outcome,
  baselineCreatinine,
  linked,
  hasDischarge,
  closeHref,
  returnTo,
}: {
  procedureId: string;
  tab: Tab;
  tabHref: Record<Tab, string>;
  indication: IndicationInitial;
  outcome: OutcomeInitial;
  baselineCreatinine: number | null;
  linked: LinkedEvent[];
  hasDischarge: boolean;
  closeHref: string;
  returnTo: string;
}) {
  const [dirty, setDirty] = useState(false);
  const tabs = (
    <div role="tablist" aria-label="Indication or outcome" className="mb-4 grid grid-cols-2 gap-2">
      {(["indication", "outcome"] as const).map((t) => (
        <Link
          key={t}
          role="tab"
          aria-selected={tab === t}
          href={tabHref[t]}
          replace
          scroll={false}
          onClick={(e) => {
            if (dirty && !window.confirm("Discard changes?")) e.preventDefault();
          }}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg border text-sm font-semibold ${tab === t ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-800"}`}
        >
          {t === "indication" ? "Indication" : "Outcome"}
        </Link>
      ))}
    </div>
  );
  return tab === "indication" ? (
    <IndicationTab procedureId={procedureId} initial={indication} tabs={tabs} closeHref={closeHref} returnTo={returnTo} onDirty={setDirty} />
  ) : (
    <OutcomeTab
      procedureId={procedureId}
      initial={outcome}
      baselineCreatinine={baselineCreatinine}
      linked={linked}
      hasDischarge={hasDischarge}
      tabs={tabs}
      closeHref={closeHref}
      returnTo={returnTo}
      onDirty={setDirty}
    />
  );
}

function Footer({ close }: { close: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" className="btn-secondary min-h-11 flex-1" onClick={close}>
        Cancel
      </button>
      <SubmitButton className="btn-primary min-h-11 flex-[2]">Save</SubmitButton>
    </div>
  );
}

// ─── Indication ────────────────────────────────────────────────────────────────

function IndicationTab({
  procedureId,
  initial,
  tabs,
  closeHref,
  returnTo,
  onDirty,
}: {
  procedureId: string;
  initial: IndicationInitial;
  tabs: React.ReactNode;
  closeHref: string;
  returnTo: string;
  onDirty: (d: boolean) => void;
}) {
  const [state, action] = useFormState<SheetState, FormData>(saveIndicationSheet, {});
  const e = state.fieldErrors ?? {};
  const [v, setV] = useState({
    ccs_class: initial.ccs_class === null ? null : String(initial.ccs_class),
    nyha_class: initial.nyha_class === null ? null : String(initial.nyha_class),
    stress_test_type: initial.stress_test_type,
    stress_test_result: initial.stress_test_result,
    cardiogenic_shock: initial.cardiogenic_shock ? true : (null as boolean | null),
    cardiac_arrest_pre_procedure: initial.cardiac_arrest_pre_procedure ? true : (null as boolean | null),
    thrombolysis_given: initial.thrombolysis_given ? true : (null as boolean | null),
    prior_pci: initial.prior_pci,
    prior_cabg: initial.prior_cabg,
    symptom_onset_at: toISTInput(initial.symptom_onset_at),
    first_medical_contact_at: toISTInput(initial.first_medical_contact_at),
    door_at: toISTInput(initial.door_at),
    device_time_at: toISTInput(initial.device_time_at),
  });
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const payload = JSON.stringify({
    ...v,
    cardiogenic_shock: v.cardiogenic_shock ?? false,
    cardiac_arrest_pre_procedure: v.cardiac_arrest_pre_procedure ?? false,
    thrombolysis_given: v.thrombolysis_given ?? false,
  });
  const [first] = useState(payload);
  const dirty = payload !== first;
  const close = useCloseSheet(closeHref, "edit-indication", dirty);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const stemi = initial.indication === "stemi";
  const d2d = doorToDevice(v.door_at, v.device_time_at);
  // ≤ 90 min green, ≤ 120 amber, > 120 red — the only red on the page (spec §3.6).
  const d2dTone = d2d === null ? "" : d2d <= 90 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : d2d <= 120 ? "border-amber-300 bg-amber-50 text-amber-950" : "border-red-300 bg-red-50 text-red-900";

  return (
    <Sheet
      title="Indication & outcome"
      closeHref={closeHref}
      returnFocusId="edit-indication"
      formAction={action}
      dirty={dirty}
      footer={<Footer close={close} />}
    >
      {tabs}
      <div className="space-y-5">
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="payload" value={payload} />
        <RegistryLegend />
        <ErrorBanner message={state.error} />
        {initial.indication !== "stemi" && (
          <Choice name="ccs" legend="CCS angina class" registry value={v.ccs_class} onChange={(x) => set({ ccs_class: x })} options={["1", "2", "3", "4"].map((c) => ({ value: c, label: c }))} optional />
        )}
        <Choice name="nyha" legend="NYHA class" registry value={v.nyha_class} onChange={(x) => set({ nyha_class: x })} options={["1", "2", "3", "4"].map((c) => ({ value: c, label: c }))} optional />
        <Choice name="stress_type" legend="Stress test" registry value={v.stress_test_type} onChange={(x) => set({ stress_test_type: x })} options={opts(ENUMS.stress_test_type)} optional />
        {v.stress_test_type && v.stress_test_type !== "none" && (
          <Choice name="stress_result" legend="Stress test result" value={v.stress_test_result} onChange={(x) => set({ stress_test_result: x })} options={opts(ENUMS.stress_test_result)} optional />
        )}
        <YesNo name="shock" legend="Cardiogenic shock" registry value={v.cardiogenic_shock} onChange={(x) => set({ cardiogenic_shock: x })} />
        <YesNo name="arrest" legend="Cardiac arrest before the procedure" registry value={v.cardiac_arrest_pre_procedure} onChange={(x) => set({ cardiac_arrest_pre_procedure: x })} />
        <YesNoUnknown name="prior_pci" legend="Previous PCI" registry value={v.prior_pci} onChange={(x) => set({ prior_pci: x })} />
        <YesNoUnknown name="prior_cabg" legend="Previous CABG" registry value={v.prior_cabg} onChange={(x) => set({ prior_cabg: x })} />
        <YesNo name="thrombolysis" legend="Thrombolysis given" value={v.thrombolysis_given} onChange={(x) => set({ thrombolysis_given: x })} />

        {stemi && (
          <section className="space-y-4 rounded-lg border border-slate-200 p-3" aria-labelledby="stemi-times">
            <h3 id="stemi-times" className="text-sm font-semibold">STEMI times</h3>
            <DateTimeField id="symptom_onset_at" label="Symptom onset" value={v.symptom_onset_at} onChange={(x) => set({ symptom_onset_at: x })} />
            <DateTimeField id="fmc" label="First medical contact" value={v.first_medical_contact_at} onChange={(x) => set({ first_medical_contact_at: x })} />
            <DateTimeField id="door_at" label="Arrival (door)" value={v.door_at} onChange={(x) => set({ door_at: x })} />
            <DateTimeField id="device_time_at" label="First device" value={v.device_time_at} onChange={(x) => set({ device_time_at: x })} error={e.device_time_at} />
            <div className={`rounded-lg border px-3 py-3 ${d2d === null ? "border-slate-200 text-slate-600" : d2dTone}`} role="status">
              <p className="text-sm">Door-to-device</p>
              <p className="text-3xl font-bold tabular-nums">{d2d === null ? "—" : `${d2d} min`}</p>
              <p className="text-xs">{d2d === null ? "Enter door and device times." : "Derived from the two times; not stored."}</p>
            </div>
          </section>
        )}
      </div>
    </Sheet>
  );
}

// ─── Outcome ───────────────────────────────────────────────────────────────────

function OutcomeTab({
  procedureId,
  initial,
  baselineCreatinine,
  linked,
  hasDischarge,
  tabs,
  closeHref,
  returnTo,
  onDirty,
}: {
  procedureId: string;
  initial: OutcomeInitial;
  baselineCreatinine: number | null;
  linked: LinkedEvent[];
  hasDischarge: boolean;
  tabs: React.ReactNode;
  closeHref: string;
  returnTo: string;
  onDirty: (d: boolean) => void;
}) {
  const [state, action] = useFormState<SheetState, FormData>(saveOutcomeSheet, {});
  const e = state.fieldErrors ?? {};
  const [v, setV] = useState({
    ...Object.fromEntries(OUTCOME_KEYS.map((k) => [k, initial[k]])) as Record<OutcomeKey, Tri>,
    death_cause: initial.death_cause ?? "",
    bleeding_barc: initial.bleeding_barc === null ? null : String(initial.bleeding_barc),
    bleeding_barc_sub: initial.bleeding_barc_sub,
    vascular_complications: initial.vascular_complications,
    creatinine_post_umol_l: str(initial.creatinine_post_umol_l),
    disposition: initial.disposition,
  });
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const payload = JSON.stringify(v);
  const [first] = useState(payload);
  const dirty = payload !== first;
  const close = useCloseSheet(closeHref, "edit-outcome", dirty);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  // AKI suggested, never set (spec §3.6): a rise ≥ 26.5 µmol/L or ≥ 1.5× baseline.
  const post = Number(v.creatinine_post_umol_l);
  const akiHint =
    baselineCreatinine !== null && v.creatinine_post_umol_l.trim() !== "" && Number.isFinite(post) && (post - baselineCreatinine >= 26.5 || post >= 1.5 * baselineCreatinine);

  // Linked events shown under the outcome they suggest (event_links has no per-outcome key).
  const linkedFor = (k: OutcomeKey) => linked.filter((ev) => SUGGESTED_OUTCOME[ev.complication]?.key === k);
  const unplaced = linked.filter((ev) => !SUGGESTED_OUTCOME[ev.complication]);
  const evLine = (ev: LinkedEvent) =>
    `from event: ${label(ev.complication).toLowerCase()}${ev.onset_at ? ` ${toISTInput(ev.onset_at).slice(11)}` : ""}${ev.treatments.length ? ` → ${ev.treatments.map((t) => label(t).toLowerCase()).join(", ")}` : ""}`;
  const outcome = (k: OutcomeKey, extra?: React.ReactNode) => (
    <div key={k} className="space-y-2">
      <TriState name={k} legend={OUTCOME_LABEL[k]} registry={["mi", "stroke", "death", "bleeding", "transfusion", "vascular_status", "aki"].includes(k)} value={v[k]} onChange={(x) => set({ [k]: x } as Partial<typeof v>)} />
      {linkedFor(k).map((ev) => (
        <p key={ev.id} className="text-xs text-slate-600">{evLine(ev)}</p>
      ))}
      {extra}
    </div>
  );

  return (
    <Sheet
      title="Indication & outcome"
      closeHref={closeHref}
      returnFocusId="edit-outcome"
      formAction={action}
      dirty={dirty}
      footer={<Footer close={close} />}
    >
      {tabs}
      <div className="space-y-5">
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="payload" value={payload} />
        <RegistryLegend />
        <ErrorBanner message={state.error} />
        <p className="text-sm text-slate-600">Each outcome is Yes, No, or Not recorded. Not recorded is never taken as No.</p>
        {outcome("mi")}
        {outcome("stroke")}
        {outcome(
          "death",
          v.death === "yes" && (
            <div className="space-y-2">
              {hasDischarge && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">A discharge is recorded. A patient who died has no discharge — remove it in step 6 before saving.</p>}
              <div>
                <label htmlFor="death_cause" className="label">Cause of death</label>
                <input id="death_cause" value={v.death_cause} onChange={(ev) => set({ death_cause: ev.target.value })} className="input" />
              </div>
              <p className="text-xs text-slate-600">Saving sets the disposition and the post-procedure condition to deceased.</p>
            </div>
          ),
        )}
        {outcome(
          "bleeding",
          v.bleeding === "yes" && (
            <div className="space-y-2">
              <Choice name="barc" legend="BARC class" value={v.bleeding_barc} onChange={(x) => set({ bleeding_barc: x })} options={["0", "1", "2", "3", "4", "5"].map((c) => ({ value: c, label: c }))} optional />
              {v.bleeding_barc === "3" && (
                <Choice name="barc_sub" legend="BARC 3" value={v.bleeding_barc_sub} onChange={(x) => set({ bleeding_barc_sub: x })} options={["a", "b", "c"].map((c) => ({ value: c, label: `3${c}` }))} optional />
              )}
            </div>
          ),
        )}
        {outcome("transfusion")}
        {outcome(
          "vascular_status",
          v.vascular_status === "yes" && (
            <Chips legend="Which" values={v.vascular_complications} onChange={(x) => set({ vascular_complications: x })} options={opts(ENUMS.vascular_complication) as { value: Enums["vascular_complication"]; label: string }[]} error={e.vascular_complications} />
          ),
        )}
        {outcome(
          "aki",
          <div className="space-y-1">
            <NumberWithUnit id="creatinine_post" label="Creatinine after the procedure" unit="µmol/L" decimal value={v.creatinine_post_umol_l} onChange={(x) => set({ creatinine_post_umol_l: x })} error={e.creatinine_post_umol_l} />
            {akiHint && v.aki !== "yes" && (
              <p className="text-sm text-amber-900">
                The rise from {baselineCreatinine} µmol/L meets the KDIGO criterion (≥ 26.5 µmol/L or ≥ 1.5×). Consider recording AKI — it is not set for you.
              </p>
            )}
          </div>,
        )}
        {outcome("new_dialysis")}
        {outcome("emergency_cabg")}
        {outcome("cardiac_tamponade")}
        {outcome("unplanned_repeat_pci")}
        {unplaced.length > 0 && (
          <div className="text-xs text-slate-600">
            <p className="font-medium">Other linked events</p>
            {unplaced.map((ev) => (
              <p key={ev.id}>{evLine(ev)}</p>
            ))}
          </div>
        )}
        <Choice
          name="disposition"
          legend="Disposition"
          registry
          value={v.death === "yes" ? "deceased" : v.disposition}
          onChange={(x) => set({ disposition: x })}
          options={opts(ENUMS.disposition.filter((d) => v.death === "yes" || d !== "deceased"))}
          optional
          error={e.disposition}
        />
      </div>
    </Sheet>
  );
}
