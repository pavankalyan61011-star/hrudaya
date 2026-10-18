"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, label } from "@/lib/labels";
import { lesionName } from "@/lib/report-format";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/form/form-status";
import { saveLesionSheet, type SheetState } from "@/app/procedures/[id]/sheets/actions";
import { Sheet, useCloseSheet } from "./sheet";
import { Choice, MedinaPicker, NumberWithUnit, RegistryTag, YesNo } from "./fields";

/** The vessel finding as loaded (Week 1 columns + 0011's lesion detail). */
export type LesionRow = {
  id: string;
  vessel: string;
  segment: string | null;
  graft_id: string | null;
  stenosis_pct: number;
  stenosis_source: string;
  timi_flow: number;
  is_culprit: boolean;
  lesion_length_mm: number | null;
  lesion_class: string | null;
  calcification: string | null;
  thrombus: boolean;
  ostial: boolean;
  bifurcation: boolean;
  bifurcation_medina: string | null;
  tortuosity: string | null;
  cto: boolean;
  cto_duration_months: number | null;
  in_stent_restenosis: boolean;
  isr_pattern: string | null;
  collaterals_rentrop: number | null;
  timi_frame_count: number | null;
  lesion_notes: string | null;
};

export type GraftOption = { id: string; graft_type: string; target_vessel: string };

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));
const str = (n: number | null) => (n === null ? "" : String(n));
const PRESETS = [30, 50, 70, 90, 100];

/**
 * §3.1 Lesion sheet. Order: vessel · segment · stenosis · TIMI pre (R) · culprit · length · class ·
 * calcification · thrombus · ostial · bifurcation → Medina · tortuosity · CTO → months · ISR →
 * pattern · Rentrop · TIMI frame count · notes. Physiology and Imaging open the §3.2 sheet.
 */
export function LesionSheet({
  procedureId,
  row,
  grafts,
  treated,
  closeHref,
}: {
  procedureId: string;
  row: LesionRow;
  grafts: GraftOption[];
  /** The lesion has an intervention: class and length are registry elements for it. */
  treated: boolean;
  closeHref: string;
}) {
  const [state, action] = useFormState<SheetState, FormData>(saveLesionSheet, {});
  const close = useCloseSheet(closeHref, `edit-lesion-${row.id}`);
  const e = state.fieldErrors ?? {};

  const [vessel, setVessel] = useState(row.vessel);
  const [segment, setSegment] = useState(row.segment);
  const [graftId, setGraftId] = useState(row.graft_id);
  const [stenosis, setStenosis] = useState(String(row.stenosis_pct));
  const [stenosisSource, setStenosisSource] = useState(row.stenosis_source);
  const [timi, setTimi] = useState(String(row.timi_flow));
  const [culprit, setCulprit] = useState(row.is_culprit);
  const [length, setLength] = useState(str(row.lesion_length_mm));
  const [lesionClass, setLesionClass] = useState(row.lesion_class);
  const [calcification, setCalcification] = useState(row.calcification);
  const [thrombus, setThrombus] = useState(row.thrombus);
  const [ostial, setOstial] = useState(row.ostial);
  const [bifurcation, setBifurcation] = useState(row.bifurcation);
  const [medina, setMedina] = useState(row.bifurcation_medina);
  const [tortuosity, setTortuosity] = useState(row.tortuosity);
  const [cto, setCto] = useState(row.cto);
  const [ctoMonths, setCtoMonths] = useState(str(row.cto_duration_months));
  const [isr, setIsr] = useState(row.in_stent_restenosis);
  const [isrPattern, setIsrPattern] = useState(row.isr_pattern);
  const [rentrop, setRentrop] = useState(row.collaterals_rentrop === null ? null : String(row.collaterals_rentrop));
  const [frames, setFrames] = useState(str(row.timi_frame_count));
  const [notes, setNotes] = useState(row.lesion_notes ?? "");

  const pickStenosis = (v: number) => {
    setStenosis(String(v));
    setStenosisSource("picked");
  };
  const stenosisNum = Number(stenosis);
  // Spec §2.2: a total occlusion should be a CTO, thrombotic, or TIMI 0 — warn, never block.
  const occlusionWarning = stenosis.trim() !== "" && stenosisNum === 100 && !cto && !thrombus && timi !== "0";

  const payload = JSON.stringify({
    vessel,
    segment,
    graft_id: graftId,
    stenosis_pct: stenosis,
    stenosis_source: stenosisSource,
    timi_flow: timi,
    is_culprit: culprit,
    lesion_length_mm: length,
    lesion_class: lesionClass,
    calcification,
    thrombus,
    ostial,
    bifurcation,
    bifurcation_medina: medina,
    tortuosity,
    cto,
    cto_duration_months: ctoMonths,
    in_stent_restenosis: isr,
    isr_pattern: isrPattern,
    collaterals_rentrop: rentrop,
    timi_frame_count: frames,
    lesion_notes: notes,
  });

  const footer = (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* §3.2 opens from here; it is built after the lesion sheet has been reviewed on a phone. */}
        <button type="button" className="btn-secondary min-h-11 flex-1 text-sm" disabled title="Physiology & imaging sheet — next">
          Physiology
        </button>
        <button type="button" className="btn-secondary min-h-11 flex-1 text-sm" disabled title="Physiology & imaging sheet — next">
          Imaging
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary min-h-11 flex-1" onClick={close}>
          Cancel
        </button>
        <SubmitButton className="btn-primary min-h-11 flex-[2]" pendingLabel="Saving…">
          Save lesion
        </SubmitButton>
      </div>
    </div>
  );

  return (
    <Sheet title="Lesion" subtitle={vessel === "graft" ? "Graft lesion" : lesionName(vessel as never, segment as never)} closeHref={closeHref} returnFocusId={`edit-lesion-${row.id}`} footer={footer} formAction={action}>
      <div className="space-y-5">
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="row_id" value={row.id} />
        <input type="hidden" name="payload" value={payload} />
        <ErrorBanner message={state.error} />

        <Choice name="vessel" legend="Vessel" value={vessel} onChange={(v) => v && setVessel(v)} options={opts(ENUMS.vessel)} columns={4} error={e.vessel} />
        {vessel === "graft" &&
          (grafts.length === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              A graft lesion sits in a recorded graft. Add the graft first (Grafts sheet), then choose it here.
            </p>
          ) : (
            <Choice
              name="graft_id"
              legend="Graft"
              value={graftId}
              onChange={setGraftId}
              options={grafts.map((g) => ({ value: g.id, label: `${label(g.graft_type)} to ${label(g.target_vessel)}` }))}
              error={e.graft_id}
            />
          ))}
        <Choice name="segment" legend="Segment" value={segment} onChange={setSegment} options={opts(ENUMS.vessel_segment)} optional />

        <fieldset>
          <legend className="label">
            Stenosis
            {stenosisSource === "measured_viewer" && (
              <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-900">Measured in viewer</span>
            )}
          </legend>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Number.isFinite(stenosisNum) ? stenosisNum : 0}
            onChange={(ev) => pickStenosis(Number(ev.target.value))}
            aria-label="Stenosis percent"
            className="h-11 w-full accent-sky-700"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={stenosisNum === v}
                onClick={() => pickStenosis(v)}
                className={`inline-flex min-h-11 min-w-12 items-center justify-center rounded-lg border px-2 text-sm font-semibold ${
                  stenosisNum === v ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                {v}%
              </button>
            ))}
            <span className="flex items-center gap-1.5">
              <input
                id="stenosis_pct"
                inputMode="numeric"
                value={stenosis}
                onChange={(ev) => {
                  setStenosis(ev.target.value);
                  setStenosisSource("typed");
                }}
                aria-label="Stenosis percent, typed"
                aria-invalid={e.stenosis_pct ? true : undefined}
                className={`input w-20 ${e.stenosis_pct ? "border-red-600" : ""}`}
              />
              <span className="text-sm font-medium text-slate-700">%</span>
            </span>
          </div>
          {e.stenosis_pct && <p className="mt-1 text-sm text-red-700">{e.stenosis_pct}</p>}
          {occlusionWarning && (
            <p role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              A 100% lesion is usually a CTO, thrombotic, or TIMI 0. Check those below — this is a reminder, not a rule.
            </p>
          )}
        </fieldset>

        <Choice
          name="timi_flow"
          legend="TIMI flow before intervention"
          registry
          value={timi}
          onChange={(v) => v && setTimi(v)}
          options={["0", "1", "2", "3"].map((t) => ({ value: t, label: `TIMI ${["0", "I", "II", "III"][Number(t)]}` }))}
          error={e.timi_flow}
        />
        <YesNo name="is_culprit" legend="Culprit lesion" value={culprit} onChange={setCulprit} />
        <NumberWithUnit id="lesion_length_mm" label="Lesion length" unit="mm" decimal value={length} onChange={setLength} registry={treated} error={e.lesion_length_mm} />
        <Choice
          name="lesion_class"
          legend="Lesion class (ACC/AHA)"
          registry={treated}
          value={lesionClass}
          onChange={setLesionClass}
          options={opts(ENUMS.lesion_class)}
          optional
        />
        <Choice name="calcification" legend="Calcification" value={calcification} onChange={setCalcification} options={opts(ENUMS.calcification_grade)} optional />
        <YesNo name="thrombus" legend="Thrombus" value={thrombus} onChange={setThrombus} />
        <YesNo name="ostial" legend="Ostial" value={ostial} onChange={setOstial} />
        <YesNo name="bifurcation" legend="Bifurcation" value={bifurcation} onChange={setBifurcation} />
        {bifurcation && <MedinaPicker value={medina} onChange={setMedina} />}
        <Choice name="tortuosity" legend="Tortuosity" value={tortuosity} onChange={setTortuosity} options={opts(ENUMS.tortuosity_grade)} optional />
        <YesNo name="cto" legend="Chronic total occlusion (CTO)" value={cto} onChange={setCto} />
        {cto && <NumberWithUnit id="cto_duration_months" label="CTO duration" unit="months" value={ctoMonths} onChange={setCtoMonths} error={e.cto_duration_months} />}
        <YesNo name="in_stent_restenosis" legend="In-stent restenosis" value={isr} onChange={setIsr} />
        {isr && <Choice name="isr_pattern" legend="ISR pattern" value={isrPattern} onChange={setIsrPattern} options={opts(ENUMS.isr_pattern)} optional />}
        <Choice
          name="collaterals_rentrop"
          legend="Collaterals (Rentrop)"
          value={rentrop}
          onChange={setRentrop}
          options={["0", "1", "2", "3"].map((g) => ({ value: g, label: `Grade ${g}` }))}
          optional
          error={e.collaterals_rentrop}
        />
        <NumberWithUnit id="timi_frame_count" label="TIMI frame count (corrected)" unit="frames" value={frames} onChange={setFrames} error={e.timi_frame_count} />
        <div>
          <label htmlFor="lesion_notes" className="label">
            Notes
          </label>
          <textarea id="lesion_notes" rows={3} value={notes} onChange={(ev) => setNotes(ev.target.value)} className="input" />
        </div>
        <p className="text-xs text-slate-500">
          <RegistryTag /> marks a registry element. Optional values can stay &ldquo;Not recorded&rdquo;.
        </p>
      </div>
    </Sheet>
  );
}
