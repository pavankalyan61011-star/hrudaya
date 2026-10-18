"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, TIMI_LABELS, label, type Enums } from "@/lib/labels";
import { toISTInput } from "@/lib/dates";
import { EVENT_GRADES, EVENT_GROUPS, GRADE_LEGEND, OUTCOME_KEYS, OUTCOME_LABEL, SUGGESTED_OUTCOME } from "@/lib/events";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/form/form-status";
import {
  addInflationRow,
  deleteEventRow,
  deleteInflationRow,
  recordAsOutcome,
  saveEventRow,
  saveInterventionSheet,
  type SheetState,
} from "@/app/procedures/[id]/sheets/actions";
import { Sheet, useCloseSheet } from "./sheet";
import { Chips, Choice, DateTimeField, NumberWithUnit, RegistryLegend, YesNo } from "./fields";
import { RowAction } from "./row-actions";

type Technique = Enums["technique"];

export type InterventionDetail = {
  id: string;
  intervention_type: string;
  techniques: Technique[];
  technique_other: string | null;
  bifurcation_strategy: string | null;
  bifurcation_strategy_other: string | null;
  guiding_catheter: string | null;
  wires: string[];
  guidewire: string;
  residual_stenosis_pct: number;
  timi_flow_post: number;
  success: boolean;
  failure_reason: string | null;
  dissection: boolean;
  dissection_grade: string | null;
  perforation: boolean;
  perforation_class: string | null;
  no_reflow: boolean;
  stent_overlap: boolean;
  total_stent_length_mm: number | null;
};

export type DeviceView = {
  id: string;
  product_name: string;
  phase: string;
  category: string;
  diameter_mm: number;
  length_mm: number;
  inflation_atm: number | null;
  quantity: number;
  inflations: { id: string; sequence: number; pressure_atm: number; duration_s: number | null }[];
};

export type EventView = {
  id: string;
  complication: Enums["complication_type"];
  severity: string;
  management: string;
  onset: string | null;
  onset_at: string | null;
  grade: string | null;
  treatments: Enums["event_treatment"][];
  treatment_other: string | null;
  resolution: string | null;
  outcome: string | null;
  linked: boolean;
};

const TECH_ROWS: { title: string; items: (Technique | "stent_overlap")[]; collapsed?: boolean }[] = [
  { title: "Balloon", items: ["poba", "predilation", "post_dilation", "pot", "re_pot", "kissing_balloon"] },
  { title: "Stent", items: ["direct_stent", "bailout_stent", "stent_overlap"] },
  {
    title: "Advanced",
    collapsed: true,
    items: ["thrombectomy", "rotational_atherectomy", "orbital_atherectomy", "intravascular_lithotripsy", "laser_atherectomy", "cutting_balloon", "scoring_balloon", "drug_coated_balloon", "cto_antegrade", "cto_retrograde", "other"],
  },
];
const TECH_LABEL: Partial<Record<Technique | "stent_overlap", string>> = {
  poba: "POBA", predilation: "Pre-dilation", post_dilation: "Post-dilation", stent_overlap: "Stent overlap", rotational_atherectomy: "Rotational",
  orbital_atherectomy: "Orbital", intravascular_lithotripsy: "IVL", laser_atherectomy: "Laser", cutting_balloon: "Cutting", scoring_balloon: "Scoring",
  drug_coated_balloon: "DCB", kissing_balloon: "Kissing balloon", other: "Other",
};
const techLabel = (t: Technique | "stent_overlap") => TECH_LABEL[t] ?? label(t);
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));
const ELLIS: Record<string, string> = { ellis_1: "Ellis I", ellis_2: "Ellis II", ellis_3: "Ellis III", ellis_3_cavity: "Ellis III cavity" };
const touched = (b: boolean) => (b ? true : null);

/** §3.5 Intervention & devices: detail (top), procedural events, devices with their inflation log. */
export function InterventionSheet({
  procedureId,
  intervention,
  lesion,
  devices,
  events,
  closeHref,
  returnTo,
}: {
  procedureId: string;
  intervention: InterventionDetail;
  lesion: { name: string; bifurcation: boolean };
  devices: DeviceView[];
  events: EventView[];
  closeHref: string;
  returnTo: string;
}) {
  const [detailDirty, setDetailDirty] = useState(false);
  const [eventDirty, setEventDirty] = useState(false);
  const dirty = detailDirty || eventDirty;
  const close = useCloseSheet(closeHref, `edit-intervention-${intervention.id}`, dirty);

  return (
    <Sheet
      title="Intervention & devices"
      subtitle={`${lesion.name} · ${label(intervention.intervention_type)}`}
      closeHref={closeHref}
      returnFocusId={`edit-intervention-${intervention.id}`}
      dirty={dirty}
      footer={
        <button type="button" className="btn-secondary min-h-11 w-full" onClick={close}>
          Done
        </button>
      }
    >
      <RegistryLegend />
      <DetailForm procedureId={procedureId} iv={intervention} lesion={lesion} devices={devices} returnTo={returnTo} onDirty={setDetailDirty} />
      <EventsSection procedureId={procedureId} events={events} onDirty={setEventDirty} />
      <DevicesSection procedureId={procedureId} devices={devices} />
    </Sheet>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────────

function DetailForm({
  procedureId,
  iv,
  lesion,
  devices,
  returnTo,
  onDirty,
}: {
  procedureId: string;
  iv: InterventionDetail;
  lesion: { bifurcation: boolean };
  devices: DeviceView[];
  returnTo: string;
  onDirty: (d: boolean) => void;
}) {
  const [state, action] = useFormState<SheetState, FormData>(saveInterventionSheet, {});
  const e = state.fieldErrors ?? {};
  const [v, setV] = useState({
    techniques: iv.techniques,
    stent_overlap: iv.stent_overlap,
    technique_other: iv.technique_other ?? "",
    bifurcation_strategy: iv.bifurcation_strategy,
    bifurcation_strategy_other: iv.bifurcation_strategy_other ?? "",
    guiding_catheter: iv.guiding_catheter ?? "",
    // The Week 1 guidewire holds "Not recorded" when no wire is known (it is NOT NULL): not a wire name.
    wires: iv.wires.length ? iv.wires : [iv.guidewire.trim().toLowerCase() === "not recorded" ? "" : iv.guidewire],
    residual_stenosis_pct: String(iv.residual_stenosis_pct),
    timi_flow_post: String(iv.timi_flow_post),
    success: iv.success as boolean | null,
    failure_reason: iv.failure_reason,
    dissection: touched(iv.dissection),
    dissection_grade: iv.dissection_grade,
    perforation: touched(iv.perforation),
    perforation_class: iv.perforation_class,
    no_reflow: touched(iv.no_reflow),
    total_stent_length_mm: iv.total_stent_length_mm === null ? "" : String(iv.total_stent_length_mm),
  });
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const payload = JSON.stringify({
    ...v,
    success: v.success ?? false,
    dissection: v.dissection ?? false,
    perforation: v.perforation ?? false,
    no_reflow: v.no_reflow ?? false,
  });
  const [first] = useState(payload);
  useEffect(() => onDirty(payload !== first), [payload, first, onDirty]);

  // Total stent length derived from the stents recorded (length × quantity); the operator may correct it.
  const derived = devices.filter((d) => d.category === "stent").reduce((sum, d) => sum + d.length_mm * d.quantity, 0);
  const selected = [...v.techniques, ...(v.stent_overlap ? (["stent_overlap"] as const) : [])];
  const toggleTech = (t: Technique | "stent_overlap") => {
    if (t === "stent_overlap") set({ stent_overlap: !v.stent_overlap });
    else set({ techniques: v.techniques.includes(t) ? v.techniques.filter((x) => x !== t) : [...v.techniques, t] });
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="row_id" value={iv.id} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="payload" value={payload} />
      <ErrorBanner message={state.error} />

      <fieldset className="space-y-3">
        <legend className="label">Techniques</legend>
        {TECH_ROWS.map((row) => {
          const chips = (
            <Chips
              values={selected as (Technique | "stent_overlap")[]}
              onChange={(next) => {
                const changed = row.items.find((t) => next.includes(t) !== selected.includes(t as never));
                if (changed) toggleTech(changed);
              }}
              options={row.items.map((t) => ({ value: t, label: techLabel(t) }))}
            />
          );
          return row.collapsed ? (
            <details key={row.title} className="rounded-lg border border-slate-200" open={row.items.some((t) => selected.includes(t as never))}>
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">{row.title}</summary>
              <div className="border-t border-slate-200 p-3">{chips}</div>
            </details>
          ) : (
            <div key={row.title}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{row.title}</p>
              {chips}
            </div>
          );
        })}
        {v.techniques.includes("other") && (
          <div>
            <label htmlFor="technique_other" className="label">Other technique</label>
            <input id="technique_other" value={v.technique_other} onChange={(ev) => set({ technique_other: ev.target.value })} className="input" />
            {e.technique_other && <p className="mt-1 text-sm text-red-700">{e.technique_other}</p>}
          </div>
        )}
      </fieldset>

      {lesion.bifurcation && (
        <div className="space-y-2">
          <Choice
            name="bifurcation_strategy"
            legend="Bifurcation strategy"
            value={v.bifurcation_strategy}
            onChange={(x) => set({ bifurcation_strategy: x })}
            options={opts(ENUMS.bifurcation_strategy)}
            optional
          />
          {v.bifurcation_strategy === "other" && (
            <div>
              <label htmlFor="bif_other" className="label">Other strategy</label>
              <input id="bif_other" value={v.bifurcation_strategy_other} onChange={(ev) => set({ bifurcation_strategy_other: ev.target.value })} className="input" />
              {e.bifurcation_strategy_other && <p className="mt-1 text-sm text-red-700">{e.bifurcation_strategy_other}</p>}
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="guiding_catheter" className="label">Guide catheter</label>
        <input id="guiding_catheter" value={v.guiding_catheter} onChange={(ev) => set({ guiding_catheter: ev.target.value })} placeholder="6F EBU 3.5" className="input" />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Wires</legend>
        {v.wires.map((w, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Wire ${i + 1}`}
              value={w}
              onChange={(ev) => set({ wires: v.wires.map((x, j) => (j === i ? ev.target.value : x)) })}
              className="input"
            />
            {v.wires.length > 1 && (
              <button type="button" className="btn min-h-11 px-3 text-sm text-red-700" aria-label={`Remove wire ${i + 1}`} onClick={() => set({ wires: v.wires.filter((_, j) => j !== i) })}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn-secondary min-h-11 text-sm" onClick={() => set({ wires: [...v.wires, ""] })}>
          Add wire
        </button>
      </fieldset>

      <NumberWithUnit id="residual" label="Residual stenosis" unit="%" registry value={v.residual_stenosis_pct} onChange={(x) => set({ residual_stenosis_pct: x })} error={e.residual_stenosis_pct} />
      <Choice name="timi_post" legend="Final TIMI flow" registry value={v.timi_flow_post} onChange={(x) => x && set({ timi_flow_post: x })} options={TIMI_LABELS.map((l, i) => ({ value: String(i), label: `TIMI ${l}` }))} />
      <YesNo name="success" legend="Successful" value={v.success} onChange={(x) => set({ success: x })} />
      {v.success === false && <Choice name="failure_reason" legend="Why not" value={v.failure_reason} onChange={(x) => set({ failure_reason: x })} options={opts(ENUMS.pci_failure_reason)} optional />}
      <YesNo name="dissection" legend="Dissection" value={v.dissection} onChange={(x) => set({ dissection: x })} />
      {v.dissection && <Choice name="dissection_grade" legend="Dissection type (NHLBI)" value={v.dissection_grade} onChange={(x) => set({ dissection_grade: x })} options={opts(ENUMS.dissection_grade)} optional />}
      <YesNo name="perforation" legend="Perforation" value={v.perforation} onChange={(x) => set({ perforation: x })} />
      {v.perforation && (
        <Choice name="perforation_class" legend="Perforation class" value={v.perforation_class} onChange={(x) => set({ perforation_class: x })} options={ENUMS.perforation_class.map((p) => ({ value: p, label: ELLIS[p] }))} optional />
      )}
      <YesNo name="no_reflow" legend="No-reflow" value={v.no_reflow} onChange={(x) => set({ no_reflow: x })} />
      <div>
        <NumberWithUnit id="total_stent" label="Total stent length" unit="mm" decimal value={v.total_stent_length_mm} onChange={(x) => set({ total_stent_length_mm: x })} error={e.total_stent_length_mm} />
        {derived > 0 && String(derived) !== v.total_stent_length_mm && (
          <p className="mt-1 text-xs text-slate-600">
            From the stents recorded: {derived} mm.{" "}
            <button type="button" className="underline" onClick={() => set({ total_stent_length_mm: String(derived) })}>
              Use {derived} mm
            </button>
          </p>
        )}
      </div>
      <SubmitButton className="btn-primary min-h-11 w-full">Save intervention</SubmitButton>
    </form>
  );
}

// ─── Procedural events ─────────────────────────────────────────────────────────

const blankEvent = {
  id: "", complication: null as Enums["complication_type"] | null, severity: null as string | null, management: "", onset: null as string | null,
  onset_at: "", grade: null as string | null, treatments: [] as Enums["event_treatment"][], treatment_other: "", resolution: null as string | null, outcome: "",
};

function eventLine(ev: EventView) {
  const treat = ev.treatments.filter((t) => t !== "other").map((t) => label(t).toLowerCase());
  if (ev.treatment_other) treat.push(ev.treatment_other);
  return [
    label(ev.complication),
    ev.grade,
    ev.onset_at ? toISTInput(ev.onset_at).slice(11) : null,
    treat.length ? `→ ${treat.join(", ")}` : null,
    ev.resolution ? label(ev.resolution).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Also the whole of the Events sheet, for a record with no intervention (spec §2.8a: events are per procedure). */
export function EventsSection({ procedureId, events, onDirty }: { procedureId: string; events: EventView[]; onDirty: (d: boolean) => void }) {
  const [state, action] = useFormState<SheetState, FormData>(saveEventRow, {});
  const [f, setF] = useState(blankEvent);
  const set = (patch: Partial<typeof blankEvent>) => {
    setF((x) => ({ ...x, ...patch }));
    onDirty(true);
  };
  useEffect(() => {
    if (state.saved) {
      setF(blankEvent);
      onDirty(false);
    }
  }, [state.saved, onDirty]);
  const e = state.fieldErrors ?? {};
  const grades = f.complication ? EVENT_GRADES[f.complication] : undefined;
  const payload = JSON.stringify({ ...f, id: f.id || null, grade: grades ? f.grade : null });

  return (
    <section className="mt-8 space-y-4 border-t border-slate-200 pt-5" aria-labelledby="events-title">
      <h3 id="events-title" className="text-sm font-bold uppercase tracking-wide text-slate-700">Procedural events</h3>
      {events.length === 0 ? (
        <p className="text-sm text-slate-600">No event recorded. Zero events means none happened.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {events.map((ev) => (
            <li key={ev.id} className="space-y-2 px-3 py-2">
              <p className="text-sm font-medium">{eventLine(ev)}</p>
              {ev.linked && <p className="text-xs text-slate-600">Recorded as an in-hospital outcome.</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn min-h-11 px-3 text-sm text-sky-800 underline"
                  onClick={() => {
                    setF({
                      id: ev.id, complication: ev.complication, severity: ev.severity, management: ev.management, onset: ev.onset, onset_at: toISTInput(ev.onset_at),
                      grade: ev.grade, treatments: ev.treatments, treatment_other: ev.treatment_other ?? "", resolution: ev.resolution, outcome: ev.outcome ?? "",
                    });
                    onDirty(false);
                  }}
                >
                  Edit
                </button>
                <RowAction action={deleteEventRow} fields={{ procedure_id: procedureId, child_id: ev.id }} confirm="Remove this event?" label={`Remove ${label(ev.complication)}`}>
                  Remove
                </RowAction>
              </div>
              {!ev.linked && <RecordAsOutcome procedureId={procedureId} ev={ev} />}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-4 rounded-lg border border-slate-200 p-3">
        <h4 className="text-sm font-semibold">{f.id ? "Edit event" : "Add event"}</h4>
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="payload" value={payload} />
        <ErrorBanner message={state.error} />
        <fieldset>
          <legend className="label">Event</legend>
          <div className="space-y-3">
            {EVENT_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>
                <div className="flex flex-wrap gap-2">
                  {g.types.map((t) => (
                    <label
                      key={t}
                      className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-600 ${
                        f.complication === t ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-800"
                      }`}
                    >
                      <input type="radio" name="complication" value={t} checked={f.complication === t} onChange={() => set({ complication: t, grade: null })} className="sr-only" />
                      {label(t)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {e.complication && <p className="mt-1 text-sm text-red-700">{e.complication}</p>}
        </fieldset>
        {grades && f.complication && (
          <Choice name="grade" legend={GRADE_LEGEND[f.complication] ?? "Grade"} value={f.grade} onChange={(x) => set({ grade: x })} options={grades.map((gr) => ({ value: gr, label: gr }))} optional error={e.grade} />
        )}
        <Choice name="severity" legend="Severity" value={f.severity} onChange={(x) => set({ severity: x })} options={opts(ENUMS.complication_severity)} error={e.severity} />
        <Choice name="onset" legend="When" value={f.onset} onChange={(x) => set({ onset: x })} options={[{ value: "intraprocedural", label: "During procedure" }, { value: "inpatient", label: "After procedure" }]} optional />
        <DateTimeField id="event-time" label="Time" value={f.onset_at} onChange={(x) => set({ onset_at: x })} error={e.onset_at} />
        <Chips legend="Treatment" values={f.treatments} onChange={(x) => set({ treatments: x })} options={ENUMS.event_treatment.map((t) => ({ value: t, label: t === "none" ? "None needed" : label(t) }))} error={e.treatments} />
        {f.treatments.includes("other") && (
          <div>
            <label htmlFor="treatment_other" className="label">Other treatment</label>
            <input id="treatment_other" value={f.treatment_other} onChange={(ev) => set({ treatment_other: ev.target.value })} className="input" />
            {e.treatment_other && <p className="mt-1 text-sm text-red-700">{e.treatment_other}</p>}
          </div>
        )}
        <div>
          <label htmlFor="management" className="label">
            Management <span className="text-red-700">*</span>
          </label>
          <input id="management" value={f.management} onChange={(ev) => set({ management: ev.target.value })} className={`input ${e.management ? "border-red-600" : ""}`} />
          {e.management && <p className="mt-1 text-sm text-red-700">{e.management}</p>}
        </div>
        <Choice name="resolution" legend="Resolution" value={f.resolution} onChange={(x) => set({ resolution: x })} options={opts(ENUMS.event_resolution)} optional />
        <div>
          <label htmlFor="event-outcome" className="label">Outcome (free text)</label>
          <input id="event-outcome" value={f.outcome} onChange={(ev) => set({ outcome: ev.target.value })} className="input" />
        </div>
        <div className="flex gap-2">
          {f.id && (
            <button type="button" className="btn-secondary min-h-11 flex-1" onClick={() => { setF(blankEvent); onDirty(false); }}>
              Cancel edit
            </button>
          )}
          <SubmitButton className="btn-primary min-h-11 flex-[2]">{f.id ? "Save event" : "Add event"}</SubmitButton>
        </div>
      </form>
    </section>
  );
}

/** "Record as outcome": the suggested outcome first; the clinician may choose another. */
function RecordAsOutcome({ procedureId, ev }: { procedureId: string; ev: EventView }) {
  const suggestion = SUGGESTED_OUTCOME[ev.complication];
  const [key, setKey] = useState<string>(suggestion?.key ?? "");
  const [vascular, setVascular] = useState<string>(suggestion?.vascular ?? "");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
      <div>
        <label htmlFor={`outcome-${ev.id}`} className="label">Record as outcome</label>
        <select id={`outcome-${ev.id}`} value={key} onChange={(e) => setKey(e.target.value)} className="input">
          <option value="">Choose…</option>
          {OUTCOME_KEYS.map((k) => (
            <option key={k} value={k}>
              {OUTCOME_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      {key === "vascular_status" && (
        <div>
          <label htmlFor={`vascular-${ev.id}`} className="label">Which</label>
          <select id={`vascular-${ev.id}`} value={vascular} onChange={(e) => setVascular(e.target.value)} className="input">
            <option value="">Choose…</option>
            {ENUMS.vascular_complication.map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
        </div>
      )}
      {key && (
        <RowAction
          action={recordAsOutcome}
          fields={{ procedure_id: procedureId, child_id: ev.id, outcome: key, vascular }}
          className="btn-secondary min-h-11 text-sm"
          label={`Record ${label(ev.complication)} as ${OUTCOME_LABEL[key as keyof typeof OUTCOME_LABEL]}`}
        >
          Record
        </RowAction>
      )}
    </div>
  );
}

// ─── Devices and inflation log ─────────────────────────────────────────────────

function DevicesSection({ procedureId, devices }: { procedureId: string; devices: DeviceView[] }) {
  const phases = ENUMS.device_phase.filter((ph) => devices.some((d) => d.phase === ph));
  return (
    <section className="mt-8 space-y-4 border-t border-slate-200 pt-5" aria-labelledby="devices-title">
      <h3 id="devices-title" className="text-sm font-bold uppercase tracking-wide text-slate-700">Devices</h3>
      {devices.length === 0 && <p className="text-sm text-slate-600">No device recorded for this intervention (capture step 4).</p>}
      {phases.map((ph) => (
        <div key={ph} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label(ph)}</p>
          {devices
            .filter((d) => d.phase === ph)
            .map((d) => (
              <details key={d.id} className="rounded-lg border border-slate-200" open={d.inflations.length > 0}>
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
                  {d.product_name} {d.diameter_mm} × {d.length_mm} mm{d.inflation_atm ? ` · nominal/max ${d.inflation_atm} atm` : ""}
                  <span className="ml-auto pl-2 text-xs text-slate-500">{d.inflations.length ? `${d.inflations.length} inflation${d.inflations.length === 1 ? "" : "s"}` : "Inflation log"}</span>
                </summary>
                <div className="space-y-2 border-t border-slate-200 p-3">
                  {d.inflations.length > 0 && (
                    <ol className="space-y-1 text-sm">
                      {d.inflations.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-2">
                          <span>
                            {f.sequence}. {f.pressure_atm} atm{f.duration_s !== null ? ` · ${f.duration_s} s` : ""}
                          </span>
                          <RowAction
                            action={deleteInflationRow}
                            fields={{ procedure_id: procedureId, device_id: d.id, child_id: f.id }}
                            label={`Remove inflation ${f.sequence} of ${d.product_name}`}
                          >
                            Remove
                          </RowAction>
                        </li>
                      ))}
                    </ol>
                  )}
                  <AddInflation procedureId={procedureId} deviceId={d.id} />
                </div>
              </details>
            ))}
        </div>
      ))}
    </section>
  );
}

function AddInflation({ procedureId, deviceId }: { procedureId: string; deviceId: string }) {
  const [state, action] = useFormState<SheetState, FormData>(addInflationRow, {});
  const [atm, setAtm] = useState("");
  const [secs, setSecs] = useState("");
  useEffect(() => {
    if (state.saved) {
      setAtm("");
      setSecs("");
    }
  }, [state.saved]);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="payload" value={JSON.stringify({ device_id: deviceId, pressure_atm: atm, duration_s: secs })} />
      <NumberWithUnit id={`atm-${deviceId}`} label="Pressure" unit="atm" value={atm} onChange={setAtm} error={e.pressure_atm} />
      <NumberWithUnit id={`secs-${deviceId}`} label="Duration" unit="s" value={secs} onChange={setSecs} error={e.duration_s} />
      <SubmitButton className="btn-secondary min-h-11 text-sm">Add inflation</SubmitButton>
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
