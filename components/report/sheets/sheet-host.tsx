import type { ProcedureFull } from "@/lib/queries/procedures";
import { label } from "@/lib/labels";
import { lesionName } from "@/lib/report-format";
import { sheetHref, type SheetParams } from "@/lib/sheets";
import type { OutcomeKey } from "@/lib/events";
import { LesionSheet } from "./lesion-sheet";
import { PhysiologySheet } from "./physiology-sheet";
import { HaemodynamicsSheet } from "./haemodynamics-sheet";
import { GraftsSheet } from "./grafts-sheet";
import { InterventionSheet } from "./intervention-sheet";
import { IndicationSheet } from "./indication-sheet";
import { EventsSheet } from "./events-sheet";
import type { Motion } from "./bullseye";

/**
 * Renders the sheet the URL names (Week 7 spec §3) over whichever page hosts it — the report or a
 * capture step — from the record that page already loaded. `base` is that page's URL without sheet
 * params; closing returns to it, and so does saving a single-form sheet. Nothing renders unless the
 * record is editable (a draft, or a record with an open amendment).
 */
export function SheetHost({ p, base, params, editable }: { p: ProcedureFull; base: string; params: SheetParams; editable: boolean }) {
  if (!editable || !params.sheet) return null;
  const graftName = (id: string | null) => {
    const g = id ? p.grafts.find((x) => x.id === id) : undefined;
    return g ? `${label(g.graft_type)} to ${label(g.target_vessel)}` : null;
  };
  const vfName = (v: ProcedureFull["vessel_findings"][number]) => graftName(v.graft_id) ?? lesionName(v.vessel, v.segment);

  switch (params.sheet) {
    case "lesion": {
      const row = p.vessel_findings.find((v) => v.id === params.row);
      if (!row) return null;
      return (
        <LesionSheet
          key={row.id}
          procedureId={p.id}
          row={row}
          grafts={p.grafts.map((g) => ({ id: g.id, graft_type: g.graft_type, target_vessel: g.target_vessel }))}
          treated={p.interventions.some((i) => i.vessel_finding_id === row.id)}
          closeHref={base}
          returnTo={base}
          links={{
            physiology: sheetHref(base, "physiology", { row: row.id, tab: "physiology" }),
            imaging: sheetHref(base, "physiology", { row: row.id, tab: "imaging" }),
            addGraft: sheetHref(base, "grafts"),
          }}
        />
      );
    }
    case "physiology": {
      const row = p.vessel_findings.find((v) => v.id === params.row);
      if (!row) return null;
      const tab = params.tab === "imaging" ? "imaging" : "physiology";
      return (
        <PhysiologySheet
          key={row.id}
          procedureId={p.id}
          lesion={{ id: row.id, name: vfName(row), rvd_mm: row.rvd_mm }}
          physiology={row.lesion_physiology}
          imaging={row.intravascular_imaging}
          tab={tab}
          closeHref={base}
          tabHref={{
            physiology: sheetHref(base, "physiology", { row: row.id, tab: "physiology" }),
            imaging: sheetHref(base, "physiology", { row: row.id, tab: "imaging" }),
          }}
        />
      );
    }
    case "haemodynamics": {
      const h = p.haemodynamics;
      return (
        <HaemodynamicsSheet
          procedureId={p.id}
          closeHref={base}
          returnTo={base}
          initial={{
            left_status: h?.left_status ?? "not_recorded",
            ao_systolic: h?.ao_systolic ?? null,
            ao_diastolic: h?.ao_diastolic ?? null,
            ao_mean: h?.ao_mean ?? null,
            lv_systolic: h?.lv_systolic ?? null,
            lv_edp: h?.lv_edp ?? null,
            heart_rate_at_measurement: h?.heart_rate_at_measurement ?? null,
            rhythm: h?.rhythm ?? null,
            lvef_status: p.lvef_status,
            lvef_pct: p.lvef_pct,
            lvef_source: p.lvef_source,
            lvef_measured_on: p.lvef_measured_on,
            mitral_regurgitation_grade: p.mitral_regurgitation_grade,
            lv_gram_performed: p.lv_gram_performed,
            wall_motion: p.lv_wall_motion.map((w) => ({ segment: w.segment, motion: w.motion as Motion })),
          }}
        />
      );
    }
    case "grafts":
      return (
        <GraftsSheet
          procedureId={p.id}
          closeHref={base}
          grafts={p.grafts.map((g) => ({ ...g, hasLesion: p.vessel_findings.some((v) => v.graft_id === g.id) }))}
        />
      );
    case "intervention": {
      const iv = p.interventions.find((i) => i.id === params.row);
      if (!iv) return null;
      const lesion = p.vessel_findings.find((v) => v.id === iv.vessel_finding_id);
      const links = new Set(p.in_hospital_outcomes?.event_links ?? []);
      return (
        <InterventionSheet
          key={iv.id}
          procedureId={p.id}
          intervention={iv}
          lesion={{ name: lesion ? vfName(lesion) : "Lesion", bifurcation: lesion?.bifurcation ?? false }}
          devices={iv.devices_used.map((d) => ({ ...d, inflations: [...d.device_inflations].sort((a, b) => a.sequence - b.sequence) }))}
          events={p.complications.map((c) => ({ ...c, linked: links.has(c.id) }))}
          closeHref={base}
          returnTo={base}
        />
      );
    }
    case "events": {
      const links = new Set(p.in_hospital_outcomes?.event_links ?? []);
      return <EventsSheet procedureId={p.id} events={p.complications.map((c) => ({ ...c, linked: links.has(c.id) }))} closeHref={base} />;
    }
    case "indication": {
      const o = p.in_hospital_outcomes;
      const tab = params.tab === "outcome" ? "outcome" : "indication";
      const outcome = Object.fromEntries(
        (["mi", "stroke", "death", "bleeding", "transfusion", "vascular_status", "aki", "new_dialysis", "emergency_cabg", "cardiac_tamponade", "unplanned_repeat_pci"] as OutcomeKey[]).map((k) => [
          k,
          o?.[k] ?? "not_recorded",
        ]),
      ) as Record<OutcomeKey, "yes" | "no" | "not_recorded">;
      const links = new Set(o?.event_links ?? []);
      return (
        <IndicationSheet
          procedureId={p.id}
          tab={tab}
          tabHref={{ indication: sheetHref(base, "indication", { tab: "indication" }), outcome: sheetHref(base, "indication", { tab: "outcome" }) }}
          indication={p}
          outcome={{
            ...outcome,
            death_cause: o?.death_cause ?? null,
            bleeding_barc: o?.bleeding_barc ?? null,
            bleeding_barc_sub: o?.bleeding_barc_sub ?? null,
            vascular_complications: o?.vascular_complications ?? [],
            creatinine_post_umol_l: o?.creatinine_post_umol_l ?? null,
            disposition: o?.disposition ?? null,
          }}
          baselineCreatinine={p.creatinine_umol_l}
          linked={p.complications.filter((c) => links.has(c.id)).map((c) => ({ id: c.id, complication: c.complication, onset_at: c.onset_at, treatments: c.treatments }))}
          hasDischarge={!!p.discharge}
          closeHref={base}
          returnTo={base}
        />
      );
    }
  }
  return null;
}
