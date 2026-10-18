"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { ENUMS, label } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";
import { ErrorBanner } from "@/components/form/form-status";
import { deleteLesionChildRow, saveImagingRow, savePhysiologyRow, type SheetState } from "@/app/procedures/[id]/sheets/actions";
import { Sheet, useCloseSheet } from "./sheet";
import { Choice, NumberWithUnit, YesNoUnknown } from "./fields";
import { RowAction } from "./row-actions";

export type PhysiologyRow = {
  id: string;
  phase: string;
  index: string;
  value: number;
  hyperaemic_agent: string | null;
  agent_dose: string | null;
  decision: string | null;
  notes: string | null;
};

export type ImagingRow = {
  id: string;
  modality: string;
  phase: string;
  mla_mm2: number | null;
  eem_area_mm2: number | null;
  plaque_burden_pct: number | null;
  calcium_arc_deg: number | null;
  calcium_thickness_mm: number | null;
  lipid_arc_deg: number | null;
  max_lcbi_4mm: number | null;
  msa_mm2: number | null;
  stent_expansion_pct: number | null;
  malapposition: boolean | null;
  edge_dissection: boolean | null;
  pullback_length_mm: number | null;
  method: string | null;
  notes: string | null;
};

type Tab = "physiology" | "imaging";
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** The usual cut-offs (spec §3.2): shown as information, never as a verdict. */
function belowCutOff(index: string, value: number) {
  if (index === "ffr") return value < 0.8 ? "0.80" : null;
  if (index === "ifr" || index === "rfr") return value < 0.89 ? "0.89" : null;
  return null;
}

function physiologyLine(r: PhysiologyRow) {
  const agent = r.hyperaemic_agent && r.hyperaemic_agent !== "none" ? `${label(r.hyperaemic_agent)}${r.agent_dose ? ` ${r.agent_dose}` : ""}` : null;
  return [`${label(r.index)} ${r.phase} ${r.value.toFixed(2)}`, agent, r.decision ? label(r.decision).toLowerCase() : null].filter(Boolean).join(" · ");
}

function imagingLine(r: ImagingRow) {
  const parts = [
    `${label(r.modality)} ${r.phase}`,
    r.mla_mm2 !== null ? `MLA ${r.mla_mm2} mm²` : null,
    r.eem_area_mm2 !== null ? `EEM ${r.eem_area_mm2} mm²` : null,
    r.plaque_burden_pct !== null ? `plaque burden ${r.plaque_burden_pct}%` : null,
    r.calcium_arc_deg !== null ? `calcium arc ${r.calcium_arc_deg}°` : null,
    r.calcium_thickness_mm !== null ? `calcium ${r.calcium_thickness_mm} mm thick` : null,
    r.lipid_arc_deg !== null ? `lipid arc ${r.lipid_arc_deg}°` : null,
    r.max_lcbi_4mm !== null ? `maxLCBI₄ₘₘ ${r.max_lcbi_4mm}` : null,
    r.msa_mm2 !== null ? `MSA ${r.msa_mm2} mm²` : null,
    r.stent_expansion_pct !== null ? `expansion ${r.stent_expansion_pct}%` : null,
    r.malapposition ? "malapposition" : null,
    r.edge_dissection ? "edge dissection" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** §3.2 Physiology & imaging, per lesion: two tabs, each a list with add / edit / remove. */
export function PhysiologySheet({
  procedureId,
  lesion,
  physiology,
  imaging,
  tab,
  closeHref,
  tabHref,
}: {
  procedureId: string;
  lesion: { id: string; name: string; rvd_mm: number | null };
  physiology: PhysiologyRow[];
  imaging: ImagingRow[];
  tab: Tab;
  closeHref: string;
  tabHref: Record<Tab, string>;
}) {
  const [dirty, setDirty] = useState(false);
  const close = useCloseSheet(closeHref, `edit-lesion-${lesion.id}`, dirty);
  const tabs = (
    <div role="tablist" aria-label="Physiology or imaging" className="mb-4 grid grid-cols-2 gap-2">
      {(["physiology", "imaging"] as const).map((t) => (
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
          {t === "physiology" ? `Physiology (${physiology.length})` : `Imaging (${imaging.length})`}
        </Link>
      ))}
    </div>
  );
  return (
    <Sheet
      title="Physiology & imaging"
      subtitle={lesion.name}
      closeHref={closeHref}
      returnFocusId={`edit-lesion-${lesion.id}`}
      dirty={dirty}
      footer={
        <button type="button" className="btn-secondary min-h-11 w-full" onClick={close}>
          Done
        </button>
      }
    >
      {tabs}
      {tab === "physiology" ? (
        <PhysiologyTab procedureId={procedureId} lesionId={lesion.id} rows={physiology} onDirty={setDirty} />
      ) : (
        <ImagingTab procedureId={procedureId} lesionId={lesion.id} rvd={lesion.rvd_mm} rows={imaging} onDirty={setDirty} />
      )}
    </Sheet>
  );
}

// ─── Physiology ────────────────────────────────────────────────────────────────

const blankPhysiology = { id: "", phase: "pre", index: "ffr", value: "", hyperaemic_agent: null as string | null, agent_dose: "", decision: null as string | null, notes: "" };

function PhysiologyTab({ procedureId, lesionId, rows, onDirty }: { procedureId: string; lesionId: string; rows: PhysiologyRow[]; onDirty: (d: boolean) => void }) {
  const [state, action] = useFormState<SheetState, FormData>(savePhysiologyRow, {});
  const [f, setF] = useState(blankPhysiology);
  const set = (patch: Partial<typeof blankPhysiology>) => {
    setF((x) => ({ ...x, ...patch }));
    onDirty(true);
  };
  useEffect(() => {
    if (state.saved) {
      setF(blankPhysiology);
      onDirty(false);
    }
  }, [state.saved, onDirty]);
  const e = state.fieldErrors ?? {};
  const resting = f.index !== "ffr";
  const valueNum = Number(f.value);
  const cut = f.value.trim() !== "" && Number.isFinite(valueNum) ? belowCutOff(f.index, valueNum) : null;
  const payload = JSON.stringify({
    id: f.id || null,
    phase: f.phase,
    index: f.index,
    value: f.value,
    hyperaemic_agent: resting ? null : f.hyperaemic_agent,
    agent_dose: f.agent_dose,
    decision: f.decision,
    method: "pressure_wire",
    notes: f.notes,
  });

  return (
    <div className="space-y-5">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">No pressure-wire measurement recorded for this lesion.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((r) => {
            const below = belowCutOff(r.index, r.value);
            return (
              <li key={r.id} className="space-y-1 px-3 py-2">
                <p className="text-sm font-medium">{physiologyLine(r)}</p>
                {below && <p className="text-xs text-amber-900">Below the usual {below} cut-off — information, not a verdict.</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn min-h-11 px-3 text-sm text-sky-800 underline"
                    onClick={() => {
                      setF({ id: r.id, phase: r.phase, index: r.index, value: r.value.toFixed(2), hyperaemic_agent: r.hyperaemic_agent, agent_dose: r.agent_dose ?? "", decision: r.decision, notes: r.notes ?? "" });
                      onDirty(false);
                    }}
                  >
                    Edit
                  </button>
                  <RowAction
                    action={deleteLesionChildRow}
                    fields={{ procedure_id: procedureId, row_id: lesionId, child_id: r.id, table: "lesion_physiology" }}
                    confirm="Remove this measurement?"
                    label={`Remove ${physiologyLine(r)}`}
                  >
                    Remove
                  </RowAction>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={action} className="space-y-4 rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold">{f.id ? "Edit measurement" : "Add measurement"}</h3>
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="row_id" value={lesionId} />
        <input type="hidden" name="payload" value={payload} />
        <ErrorBanner message={state.error} />
        <Choice name="phase" legend="Phase" value={f.phase} onChange={(v) => v && set({ phase: v })} options={[{ value: "pre", label: "Pre" }, { value: "post", label: "Post" }]} />
        <Choice name="index" legend="Index" value={f.index} onChange={(v) => v && set({ index: v, hyperaemic_agent: v === "ffr" ? f.hyperaemic_agent : null })} options={opts(ENUMS.physiology_index)} />
        <div>
          <NumberWithUnit id="phys-value" label="Value" unit="(0.00–1.00)" decimal value={f.value} onChange={(v) => set({ value: v })} error={e.value} />
          {cut && <p className="mt-1 text-sm text-amber-900">Below the usual {cut} cut-off — information, not a verdict.</p>}
        </div>
        {!resting && (
          <>
            <Choice name="agent" legend="Hyperaemic agent" value={f.hyperaemic_agent} onChange={(v) => set({ hyperaemic_agent: v })} options={opts(ENUMS.hyperaemic_agent)} optional error={e.hyperaemic_agent} />
            {f.hyperaemic_agent && f.hyperaemic_agent !== "none" && (
              <div>
                <label htmlFor="agent-dose" className="label">Agent dose</label>
                <input id="agent-dose" value={f.agent_dose} onChange={(ev) => set({ agent_dose: ev.target.value })} placeholder="140 µg/kg/min" className="input" />
              </div>
            )}
          </>
        )}
        <Choice name="decision" legend="Decision this value supported" value={f.decision} onChange={(v) => set({ decision: v })} options={opts(ENUMS.physiology_decision)} optional />
        <div>
          <label htmlFor="phys-notes" className="label">Notes</label>
          <input id="phys-notes" value={f.notes} onChange={(ev) => set({ notes: ev.target.value })} className="input" />
        </div>
        <div className="flex gap-2">
          {f.id && (
            <button type="button" className="btn-secondary min-h-11 flex-1" onClick={() => { setF(blankPhysiology); onDirty(false); }}>
              Cancel edit
            </button>
          )}
          <SubmitButton className="btn-primary min-h-11 flex-[2]">{f.id ? "Save measurement" : "Add measurement"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}

// ─── Imaging ───────────────────────────────────────────────────────────────────

const blankImaging = {
  id: "", modality: "ivus", phase: "pre", mla_mm2: "", eem_area_mm2: "", plaque_burden_pct: "", calcium_arc_deg: "", calcium_thickness_mm: "",
  lipid_arc_deg: "", max_lcbi_4mm: "", msa_mm2: "", stent_expansion_pct: "", malapposition: null as boolean | null, edge_dissection: null as boolean | null,
  pullback_length_mm: "", method: null as string | null, notes: "",
};

function ImagingTab({ procedureId, lesionId, rvd, rows, onDirty }: { procedureId: string; lesionId: string; rvd: number | null; rows: ImagingRow[]; onDirty: (d: boolean) => void }) {
  const [state, action] = useFormState<SheetState, FormData>(saveImagingRow, {});
  const [f, setF] = useState(blankImaging);
  const set = (patch: Partial<typeof blankImaging>) => {
    setF((x) => ({ ...x, ...patch }));
    onDirty(true);
  };
  useEffect(() => {
    if (state.saved) {
      setF(blankImaging);
      onDirty(false);
    }
  }, [state.saved, onDirty]);
  const e = state.fieldErrors ?? {};
  const oct = f.modality === "oct";
  const nirs = f.modality === "nirs_ivus";
  const post = f.phase === "post";
  // Spec §3.2: expansion from MSA / reference when both are known; the reference here is the
  // lesion's reference vessel diameter (RVD) as a circle. A hint only — the typed value is stored.
  const msa = Number(f.msa_mm2);
  const refArea = rvd ? Math.PI * (rvd / 2) ** 2 : null;
  const derived = post && refArea && f.msa_mm2.trim() !== "" && Number.isFinite(msa) ? Math.round((msa / refArea) * 100) : null;
  const payload = JSON.stringify({ ...f, id: f.id || null });
  const num = (key: keyof typeof blankImaging, lbl: string, unit: string, decimal = false) => (
    <NumberWithUnit id={`img-${key}`} label={lbl} unit={unit} decimal={decimal} value={f[key] as string} onChange={(v) => set({ [key]: v })} error={e[key]} />
  );

  return (
    <div className="space-y-5">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">No intravascular imaging recorded for this lesion.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 px-3 py-2">
              <p className="text-sm font-medium">{imagingLine(r)}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn min-h-11 px-3 text-sm text-sky-800 underline"
                  onClick={() => {
                    setF({
                      id: r.id, modality: r.modality, phase: r.phase, mla_mm2: str(r.mla_mm2), eem_area_mm2: str(r.eem_area_mm2),
                      plaque_burden_pct: str(r.plaque_burden_pct), calcium_arc_deg: str(r.calcium_arc_deg), calcium_thickness_mm: str(r.calcium_thickness_mm),
                      lipid_arc_deg: str(r.lipid_arc_deg), max_lcbi_4mm: str(r.max_lcbi_4mm), msa_mm2: str(r.msa_mm2), stent_expansion_pct: str(r.stent_expansion_pct),
                      malapposition: r.malapposition, edge_dissection: r.edge_dissection, pullback_length_mm: str(r.pullback_length_mm), method: r.method, notes: r.notes ?? "",
                    });
                    onDirty(false);
                  }}
                >
                  Edit
                </button>
                <RowAction
                  action={deleteLesionChildRow}
                  fields={{ procedure_id: procedureId, row_id: lesionId, child_id: r.id, table: "intravascular_imaging" }}
                  confirm="Remove this pullback?"
                  label={`Remove ${imagingLine(r)}`}
                >
                  Remove
                </RowAction>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-4 rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold">{f.id ? "Edit pullback" : "Add pullback"}</h3>
        <input type="hidden" name="procedure_id" value={procedureId} />
        <input type="hidden" name="row_id" value={lesionId} />
        <input type="hidden" name="payload" value={payload} />
        <ErrorBanner message={state.error} />
        <Choice name="modality" legend="Modality" value={f.modality} onChange={(v) => v && set({ modality: v })} options={opts(ENUMS.imaging_modality)} />
        <Choice name="img-phase" legend="Phase" value={f.phase} onChange={(v) => v && set({ phase: v })} options={[{ value: "pre", label: "Pre" }, { value: "post", label: "Post" }]} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num("mla_mm2", "Minimum lumen area", "mm²", true)}
          {num("eem_area_mm2", "EEM area at MLA", "mm²", true)}
          {num("plaque_burden_pct", "Plaque burden", "%")}
          {num("calcium_arc_deg", "Calcium arc", "°")}
          {oct && num("calcium_thickness_mm", "Calcium thickness", "mm", true)}
          {oct && num("lipid_arc_deg", "Lipid arc", "°")}
          {nirs && num("max_lcbi_4mm", "maxLCBI 4 mm", "")}
          {num("pullback_length_mm", "Pullback length", "mm")}
        </div>
        {post && (
          <div className="space-y-4 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">After stenting</p>
            {num("msa_mm2", "Minimum stent area", "mm²", true)}
            <div>
              {num("stent_expansion_pct", "Stent expansion", "%")}
              {derived !== null && (
                <p className="mt-1 text-xs text-slate-600">
                  From MSA and the reference ({rvd} mm RVD): about {derived}%.{" "}
                  <button type="button" className="underline" onClick={() => set({ stent_expansion_pct: String(derived) })}>
                    Use {derived}%
                  </button>
                </p>
              )}
            </div>
            <YesNoUnknown name="malapposition" legend="Malapposition" value={f.malapposition} onChange={(v) => set({ malapposition: v })} />
            <YesNoUnknown name="edge_dissection" legend="Edge dissection" value={f.edge_dissection} onChange={(v) => set({ edge_dissection: v })} />
          </div>
        )}
        <Choice name="img-method" legend="Areas traced" value={f.method} onChange={(v) => set({ method: v })} options={opts(ENUMS.imaging_method)} optional />
        <div>
          <label htmlFor="img-notes" className="label">Notes</label>
          <input id="img-notes" value={f.notes} onChange={(ev) => set({ notes: ev.target.value })} className="input" />
        </div>
        <div className="flex gap-2">
          {f.id && (
            <button type="button" className="btn-secondary min-h-11 flex-1" onClick={() => { setF(blankImaging); onDirty(false); }}>
              Cancel edit
            </button>
          )}
          <SubmitButton className="btn-primary min-h-11 flex-[2]">{f.id ? "Save pullback" : "Add pullback"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
