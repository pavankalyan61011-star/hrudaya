"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, TIMI_LABELS, label } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/form/form-status";
import { deleteGraftRow, saveGraftRow, type SheetState } from "@/app/procedures/[id]/sheets/actions";
import { Sheet, useCloseSheet } from "./sheet";
import { Choice, NumberWithUnit, YesNo } from "./fields";
import { RowAction } from "./row-actions";

export type GraftRow = {
  id: string;
  graft_type: string;
  target_vessel: string;
  sequential: boolean;
  patency: string;
  stenosis_pct: number | null;
  lesion_location: string | null;
  cabg_year: number | null;
  notes: string | null;
  /** A vessel finding (vessel = graft) already sits in this graft. */
  hasLesion: boolean;
};

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));
const name = (g: { graft_type: string; target_vessel: string }) => `${label(g.graft_type)} to ${label(g.target_vessel)}`;
const blank = {
  id: "", graft_type: null as string | null, target_vessel: null as string | null, sequential: null as boolean | null, patency: null as string | null,
  stenosis_pct: "", lesion_location: null as string | null, cabg_year: "", notes: "", addLesion: false, timi: null as string | null,
};

function graftLine(g: GraftRow) {
  return [
    name(g),
    g.sequential ? "sequential" : null,
    g.patency === "stenosed" && g.stenosis_pct !== null ? `stenosed ${g.stenosis_pct}%` : label(g.patency).toLowerCase(),
    g.lesion_location ? label(g.lesion_location).toLowerCase() : null,
    g.cabg_year ? `CABG ${g.cabg_year}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** §3.4 Grafts: list + add / edit / remove; a diseased graft can be added as a lesion (vessel = graft). */
export function GraftsSheet({ procedureId, grafts, closeHref }: { procedureId: string; grafts: GraftRow[]; closeHref: string }) {
  const [state, action] = useFormState<SheetState, FormData>(saveGraftRow, {});
  const [f, setF] = useState(blank);
  const [dirty, setDirty] = useState(false);
  const close = useCloseSheet(closeHref, "edit-grafts", dirty);
  const set = (patch: Partial<typeof blank>) => {
    setF((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  useEffect(() => {
    if (state.saved) {
      setF(blank);
      setDirty(false);
    }
  }, [state.saved]);
  const e = state.fieldErrors ?? {};
  const diseased = f.patency === "stenosed" || f.patency === "occluded";
  const editing = grafts.find((g) => g.id === f.id);
  const payload = JSON.stringify({
    id: f.id || null,
    graft_type: f.graft_type,
    target_vessel: f.target_vessel,
    sequential: f.sequential ?? false,
    patency: f.patency,
    stenosis_pct: f.stenosis_pct,
    lesion_location: f.lesion_location,
    cabg_year: f.cabg_year,
    notes: f.notes,
    add_lesion: f.addLesion && diseased,
    add_lesion_timi: f.addLesion && diseased ? f.timi : null,
  });

  return (
    <Sheet
      title="Grafts"
      subtitle="Bypass grafts seen on this study"
      closeHref={closeHref}
      returnFocusId="edit-grafts"
      dirty={dirty}
      footer={
        <button type="button" className="btn-secondary min-h-11 w-full" onClick={close}>
          Done
        </button>
      }
    >
      <div className="space-y-5">
        {grafts.length === 0 ? (
          <p className="text-sm text-slate-600">No graft recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {grafts.map((g) => (
              <li key={g.id} className="space-y-1 px-3 py-2">
                <p className="text-sm font-medium">{graftLine(g)}</p>
                {g.hasLesion && <p className="text-xs text-slate-600">Recorded as a lesion in Coronary anatomy.</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn min-h-11 px-3 text-sm text-sky-800 underline"
                    onClick={() => {
                      setF({
                        id: g.id, graft_type: g.graft_type, target_vessel: g.target_vessel, sequential: g.sequential ? true : null, patency: g.patency,
                        stenosis_pct: g.stenosis_pct === null ? "" : String(g.stenosis_pct), lesion_location: g.lesion_location,
                        cabg_year: g.cabg_year === null ? "" : String(g.cabg_year), notes: g.notes ?? "", addLesion: false, timi: null,
                      });
                      setDirty(false);
                    }}
                  >
                    Edit
                  </button>
                  <RowAction action={deleteGraftRow} fields={{ procedure_id: procedureId, child_id: g.id }} confirm="Remove this graft?" label={`Remove ${name(g)}`}>
                    Remove
                  </RowAction>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={action} className="space-y-4 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold">{f.id ? "Edit graft" : "Add graft"}</h3>
          <input type="hidden" name="procedure_id" value={procedureId} />
          <input type="hidden" name="payload" value={payload} />
          <ErrorBanner message={state.error} />
          <Choice name="graft_type" legend="Graft" value={f.graft_type} onChange={(v) => set({ graft_type: v })} options={opts(ENUMS.graft_type)} error={e.graft_type} />
          <Choice name="target_vessel" legend="Supplies (native vessel)" value={f.target_vessel} onChange={(v) => set({ target_vessel: v })} options={opts(ENUMS.vessel.filter((x) => x !== "graft"))} columns={4} error={e.target_vessel} />
          <YesNo name="sequential" legend="Sequential" value={f.sequential} onChange={(v) => set({ sequential: v })} />
          <Choice name="patency" legend="Patency" value={f.patency} onChange={(v) => set({ patency: v })} options={opts(ENUMS.graft_patency)} error={e.patency} />
          {f.patency === "stenosed" && <NumberWithUnit id="graft-stenosis" label="Stenosis" unit="%" value={f.stenosis_pct} onChange={(v) => set({ stenosis_pct: v })} error={e.stenosis_pct} />}
          {diseased && <Choice name="lesion_location" legend="Where in the graft" value={f.lesion_location} onChange={(v) => set({ lesion_location: v })} options={opts(ENUMS.graft_lesion_location)} optional />}
          <NumberWithUnit id="cabg-year" label="CABG year" unit="" value={f.cabg_year} onChange={(v) => set({ cabg_year: v })} error={e.cabg_year} />
          <div>
            <label htmlFor="graft-notes" className="label">Notes</label>
            <input id="graft-notes" value={f.notes} onChange={(ev) => set({ notes: ev.target.value })} className="input" />
          </div>
          {diseased && !editing?.hasLesion && (
            <div className="space-y-3 rounded-lg bg-slate-50 p-3">
              <YesNo name="add_lesion" legend="Add as lesion (Coronary anatomy)" value={f.addLesion ? true : null} onChange={(v) => set({ addLesion: v })} />
              {f.addLesion && (
                <Choice
                  name="lesion_timi"
                  legend="TIMI flow in the graft before intervention"
                  registry
                  value={f.timi}
                  onChange={(v) => set({ timi: v })}
                  options={TIMI_LABELS.map((l, i) => ({ value: String(i), label: `TIMI ${l}` }))}
                  error={e.add_lesion_timi}
                />
              )}
            </div>
          )}
          <div className="flex gap-2">
            {f.id && (
              <button type="button" className="btn-secondary min-h-11 flex-1" onClick={() => { setF(blank); setDirty(false); }}>
                Cancel edit
              </button>
            )}
            <SubmitButton className="btn-primary min-h-11 flex-[2]" pendingLabel="Saving…">
              {f.id ? "Save graft" : "Add graft"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
