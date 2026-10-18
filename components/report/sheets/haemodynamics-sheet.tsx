"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, label } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/form/form-status";
import { saveHaemodynamicsSheet, type SheetState } from "@/app/procedures/[id]/sheets/actions";
import { Sheet, useCloseSheet } from "./sheet";
import { Choice, FieldError, NumberWithUnit, RegistryLegend, StatusPill, YesNoUnknown } from "./fields";
import { Bullseye, type Motion } from "./bullseye";

type Status = "not_recorded" | "not_performed" | "recorded";

export type HaemodynamicsInitial = {
  left_status: Status;
  ao_systolic: number | null;
  ao_diastolic: number | null;
  ao_mean: number | null;
  lv_systolic: number | null;
  lv_edp: number | null;
  heart_rate_at_measurement: number | null;
  rhythm: string | null;
  lvef_status: Status;
  lvef_pct: number | null;
  lvef_source: string | null;
  lvef_measured_on: string | null;
  mitral_regurgitation_grade: number | null;
  lv_gram_performed: boolean | null;
  wall_motion: { segment: number; motion: Motion }[];
};

const str = (n: number | null) => (n === null ? "" : String(n));

/**
 * §3.3 Haemodynamics & LV. One block this week — left heart — with its status pill; right heart and
 * valves are a greyed "coming later" row (Week 7b). LV: EF (three-state) + source + date, MR grade,
 * LV-gram, and the 17-segment bullseye.
 */
export function HaemodynamicsSheet({ procedureId, initial, closeHref, returnTo }: { procedureId: string; initial: HaemodynamicsInitial; closeHref: string; returnTo: string }) {
  const [state, action] = useFormState<SheetState, FormData>(saveHaemodynamicsSheet, {});
  const e = state.fieldErrors ?? {};
  const [v, setV] = useState({
    left_status: initial.left_status,
    ao_systolic: str(initial.ao_systolic),
    ao_diastolic: str(initial.ao_diastolic),
    ao_mean: str(initial.ao_mean),
    lv_systolic: str(initial.lv_systolic),
    lv_edp: str(initial.lv_edp),
    heart_rate_at_measurement: str(initial.heart_rate_at_measurement),
    rhythm: initial.rhythm,
    lvef_status: initial.lvef_status,
    lvef_pct: str(initial.lvef_pct),
    lvef_source: initial.lvef_source,
    lvef_measured_on: initial.lvef_measured_on ?? "",
    mitral_regurgitation_grade: initial.mitral_regurgitation_grade === null ? null : String(initial.mitral_regurgitation_grade),
    lv_gram_performed: initial.lv_gram_performed,
  });
  const [wall, setWall] = useState<Record<number, Motion>>(Object.fromEntries(initial.wall_motion.map((w) => [w.segment, w.motion])));
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));

  const payload = JSON.stringify({
    ...v,
    wall_motion: Object.entries(wall)
      .map(([segment, motion]) => ({ segment: Number(segment), motion }))
      .sort((a, b) => a.segment - b.segment),
  });
  const [first] = useState(payload);
  const dirty = payload !== first;
  const close = useCloseSheet(closeHref, "edit-haemodynamics", dirty);
  const abnormal = Object.keys(wall).length;

  return (
    <Sheet
      title="Haemodynamics & LV"
      closeHref={closeHref}
      returnFocusId="edit-haemodynamics"
      formAction={action}
      dirty={dirty}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary min-h-11 flex-1" onClick={close}>
            Cancel
          </button>
          <SubmitButton className="btn-primary min-h-11 flex-[2]">Save</SubmitButton>
        </div>
      }
    >
      <div className="space-y-5">
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="payload" value={payload} />
        <RegistryLegend />
        <ErrorBanner message={state.error} />

        <section className="space-y-4 rounded-lg border border-slate-200 p-3" aria-labelledby="left-heart">
          <h3 id="left-heart" className="text-sm font-semibold">Left heart</h3>
          <StatusPill name="left_status" legend="Status" value={v.left_status} onChange={(s) => set({ left_status: s })} />
          {v.left_status === "recorded" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberWithUnit id="ao_systolic" label="Aortic systolic" unit="mmHg" value={v.ao_systolic} onChange={(x) => set({ ao_systolic: x })} error={e.ao_systolic} />
              <NumberWithUnit id="ao_diastolic" label="Aortic diastolic" unit="mmHg" value={v.ao_diastolic} onChange={(x) => set({ ao_diastolic: x })} error={e.ao_diastolic} />
              <NumberWithUnit id="ao_mean" label="Aortic mean" unit="mmHg" value={v.ao_mean} onChange={(x) => set({ ao_mean: x })} error={e.ao_mean} />
              <NumberWithUnit id="lv_systolic" label="LV systolic" unit="mmHg" value={v.lv_systolic} onChange={(x) => set({ lv_systolic: x })} error={e.lv_systolic} />
              <NumberWithUnit id="lv_edp" label="LVEDP" unit="mmHg" value={v.lv_edp} onChange={(x) => set({ lv_edp: x })} error={e.lv_edp} />
            </div>
          )}
        </section>
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500" aria-disabled="true">
          Right heart · valves — coming later
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberWithUnit id="heart_rate" label="Heart rate at measurement" unit="bpm" value={v.heart_rate_at_measurement} onChange={(x) => set({ heart_rate_at_measurement: x })} error={e.heart_rate_at_measurement} />
        </div>
        <Choice name="rhythm" legend="Rhythm" value={v.rhythm} onChange={(x) => set({ rhythm: x })} options={ENUMS.heart_rhythm.map((r) => ({ value: r, label: label(r) }))} optional />

        <section className="space-y-4 rounded-lg border border-slate-200 p-3" aria-labelledby="lv">
          <h3 id="lv" className="text-sm font-semibold">LV function</h3>
          <StatusPill name="lvef_status" legend="LVEF" registry value={v.lvef_status} onChange={(s) => set({ lvef_status: s })} />
          {v.lvef_status === "recorded" && (
            <div className="space-y-4">
              <NumberWithUnit id="lvef_pct" label="Ejection fraction" unit="%" value={v.lvef_pct} onChange={(x) => set({ lvef_pct: x })} error={e.lvef_pct} />
              <Choice name="lvef_source" legend="Measured by" value={v.lvef_source} onChange={(x) => set({ lvef_source: x })} options={ENUMS.lvef_source.map((s) => ({ value: s, label: s === "mri" ? "MRI" : label(s) }))} optional />
              <div>
                <label htmlFor="lvef_measured_on" className="label">Measured on</label>
                <input id="lvef_measured_on" type="date" value={v.lvef_measured_on} onChange={(ev) => set({ lvef_measured_on: ev.target.value })} className="input max-w-[12rem]" />
              </div>
            </div>
          )}
          <Choice
            name="mr_grade"
            legend="Mitral regurgitation grade"
            value={v.mitral_regurgitation_grade}
            onChange={(x) => set({ mitral_regurgitation_grade: x })}
            options={["0", "1", "2", "3", "4"].map((g) => ({ value: g, label: g }))}
            optional
          />
          <YesNoUnknown name="lv_gram" legend="LV-gram performed" value={v.lv_gram_performed} onChange={(x) => set({ lv_gram_performed: x })} />
          <fieldset>
            <legend className="label">Wall motion {abnormal > 0 ? `(${abnormal} abnormal segment${abnormal === 1 ? "" : "s"})` : "(all normal)"}</legend>
            <Bullseye value={wall} onChange={setWall} />
            <FieldError message={e.wall_motion} />
          </fieldset>
        </section>
      </div>
    </Sheet>
  );
}
