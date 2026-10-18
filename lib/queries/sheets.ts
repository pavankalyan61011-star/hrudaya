/**
 * Saves for the Week 7 report sheets (spec §3). Each writes through the signed-in user's client, so
 * RLS and the reviewed-record guard apply; an update that matches no row (wrong procedure, or a row
 * RLS hides) is reported as an error, never as success. Child rows are always checked to belong to
 * the procedure named in the URL before they are touched.
 *
 * Old homes kept in step (spec §2.5: "leave the old columns" until the mapper is switched):
 * haemodynamics also writes procedures.aortic_pressure_* / lvedp_*, and interventions.wires[1] also
 * writes interventions.guidewire.
 */
import type { DbClient } from "@/lib/supabase/types";
import type { Enums } from "@/lib/labels";
import type { OutcomeKey } from "@/lib/events";
import type {
  EventSchema,
  GraftSchema,
  HaemodynamicsSheetSchema,
  ImagingRowSchema,
  IndicationSheetSchema,
  InflationSchema,
  InterventionSheetSchema,
  LesionSheetInput,
  OutcomeSheetSchema,
  PhysiologyRowSchema,
} from "@/lib/validation/capture";
import type { z } from "zod";
import type { DbError } from "./errors";

type Result = { error: DbError };
const NOT_FOUND: Result = { error: { code: "P0002", message: "row not found" } };
const one = (data: unknown[] | null): Result => ((data ?? []).length === 1 ? { error: null } : NOT_FOUND);

/** The vessel finding exists and belongs to this procedure. */
async function lesionOf(db: DbClient, procedureId: string, vesselFindingId: string) {
  const { data, error } = await db.from("vessel_findings").select("id, bifurcation").eq("id", vesselFindingId).eq("procedure_id", procedureId).maybeSingle();
  return { lesion: data, error };
}

// ─── §3.1 Lesion ───────────────────────────────────────────────────────────────

export async function updateLesion(db: DbClient, procedureId: string, vesselFindingId: string, fields: LesionSheetInput): Promise<Result> {
  const { data, error } = await db.from("vessel_findings").update(fields).eq("id", vesselFindingId).eq("procedure_id", procedureId).select("id");
  return error ? { error } : one(data);
}

// ─── §3.2 Physiology and imaging ───────────────────────────────────────────────

type Physiology = z.infer<typeof PhysiologyRowSchema>;
type Imaging = z.infer<typeof ImagingRowSchema>;

export async function savePhysiology(db: DbClient, procedureId: string, vesselFindingId: string, row: Physiology): Promise<Result> {
  const { lesion, error: le } = await lesionOf(db, procedureId, vesselFindingId);
  if (le) return { error: le };
  if (!lesion) return NOT_FOUND;
  const { id, ...fields } = row;
  if (id) {
    const { data, error } = await db.from("lesion_physiology").update({ ...fields, source: "typed" }).eq("id", id).eq("vessel_finding_id", vesselFindingId).select("id");
    return error ? { error } : one(data);
  }
  const { error } = await db.from("lesion_physiology").insert({ ...fields, vessel_finding_id: vesselFindingId, source: "typed" });
  return { error };
}

export async function saveImaging(db: DbClient, procedureId: string, vesselFindingId: string, row: Imaging): Promise<Result> {
  const { lesion, error: le } = await lesionOf(db, procedureId, vesselFindingId);
  if (le) return { error: le };
  if (!lesion) return NOT_FOUND;
  const { id, ...fields } = row;
  if (id) {
    const { data, error } = await db.from("intravascular_imaging").update({ ...fields, source: "typed" }).eq("id", id).eq("vessel_finding_id", vesselFindingId).select("id");
    return error ? { error } : one(data);
  }
  const { error } = await db.from("intravascular_imaging").insert({ ...fields, vessel_finding_id: vesselFindingId, source: "typed" });
  return { error };
}

export async function deleteLesionChild(db: DbClient, procedureId: string, vesselFindingId: string, table: "lesion_physiology" | "intravascular_imaging", id: string): Promise<Result> {
  const { lesion, error: le } = await lesionOf(db, procedureId, vesselFindingId);
  if (le) return { error: le };
  if (!lesion) return NOT_FOUND;
  const { data, error } = await db.from(table).delete().eq("id", id).eq("vessel_finding_id", vesselFindingId).select("id");
  return error ? { error } : one(data);
}

// ─── §3.3 Haemodynamics and LV ─────────────────────────────────────────────────

type Haemodynamics = z.infer<typeof HaemodynamicsSheetSchema>;

export async function saveHaemodynamics(db: DbClient, procedureId: string, v: Haemodynamics): Promise<Result> {
  const h = await db.from("haemodynamics").upsert(
    {
      procedure_id: procedureId, left_status: v.left_status, ao_systolic: v.ao_systolic, ao_diastolic: v.ao_diastolic, ao_mean: v.ao_mean,
      lv_systolic: v.lv_systolic, lv_edp: v.lv_edp, heart_rate_at_measurement: v.heart_rate_at_measurement, rhythm: v.rhythm, source: "typed",
    },
    { onConflict: "procedure_id" },
  );
  if (h.error) return { error: h.error };

  // Old homes, kept equal until the FHIR mapper reads haemodynamics (spec §2.5). LVEDP has its own
  // three-state there and the left block has one status for all its values, so the old status only
  // changes when the sheet says something about LVEDP: a value → recorded; the block not performed →
  // not performed; no value → unchanged, unless it was a recorded value that has now been removed.
  // (Seeded cases record LVEDP "not performed" beside an aortic pressure; that fact must survive.)
  const { data: current, error: ce } = await db.from("procedures").select("lvedp_status").eq("id", procedureId).maybeSingle();
  if (ce) return { error: ce };
  if (!current) return NOT_FOUND;
  const lvedpStatus: Enums["measurement_status"] =
    v.lv_edp !== null ? "recorded" : v.left_status === "not_performed" ? "not_performed" : current.lvedp_status === "recorded" ? "not_recorded" : current.lvedp_status;
  const { data, error } = await db
    .from("procedures")
    .update({
      aortic_pressure_systolic: v.ao_systolic,
      aortic_pressure_diastolic: v.ao_diastolic,
      lvedp_status: lvedpStatus,
      lvedp_mmhg: v.lv_edp,
      lvef_status: v.lvef_status,
      lvef_pct: v.lvef_pct,
      lvef_source: v.lvef_source,
      lvef_measured_on: v.lvef_measured_on,
      mitral_regurgitation_grade: v.mitral_regurgitation_grade,
      lv_gram_performed: v.lv_gram_performed,
    })
    .eq("id", procedureId)
    .select("id");
  if (error) return { error };
  if ((data ?? []).length !== 1) return NOT_FOUND;

  // Wall motion: the set shown is the set stored (absence = normal).
  const del = await db.from("lv_wall_motion").delete().eq("procedure_id", procedureId);
  if (del.error) return { error: del.error };
  if (v.wall_motion.length === 0) return { error: null };
  const ins = await db.from("lv_wall_motion").insert(v.wall_motion.map((w) => ({ ...w, procedure_id: procedureId, source: "picked" as const })));
  return { error: ins.error };
}

// ─── §3.4 Grafts ───────────────────────────────────────────────────────────────

type Graft = z.infer<typeof GraftSchema>;

export async function saveGraft(db: DbClient, procedureId: string, g: Graft): Promise<Result> {
  const { id, add_lesion, add_lesion_timi, ...fields } = g;
  let graftId = id;
  if (id) {
    const { data, error } = await db.from("grafts").update(fields).eq("id", id).eq("procedure_id", procedureId).select("id");
    if (error) return { error };
    if ((data ?? []).length !== 1) return NOT_FOUND;
  } else {
    const { data, error } = await db.from("grafts").insert({ ...fields, procedure_id: procedureId }).select("id").single();
    if (error) return { error };
    graftId = data.id;
  }
  // "Add as lesion": the graft lesion, with the graft's stenosis (100% when occluded).
  if (add_lesion && add_lesion_timi !== null && graftId && (g.patency === "stenosed" || g.patency === "occluded")) {
    const stenosis = g.patency === "occluded" ? 100 : g.stenosis_pct;
    if (stenosis === null) return { error: { code: "22004", message: "graft lesion needs a stenosis", hint: "hrudaya:graft_lesion_needs_stenosis" } };
    const { error } = await db.from("vessel_findings").insert({ procedure_id: procedureId, vessel: "graft", graft_id: graftId, stenosis_pct: stenosis, timi_flow: add_lesion_timi });
    if (error) return { error };
  }
  return { error: null };
}

export async function deleteGraft(db: DbClient, procedureId: string, id: string): Promise<Result> {
  const { data, error } = await db.from("grafts").delete().eq("id", id).eq("procedure_id", procedureId).select("id");
  return error ? { error } : one(data);
}

// ─── §3.5 Intervention, events, inflations ─────────────────────────────────────

type InterventionDetail = z.infer<typeof InterventionSheetSchema>;
type EventInput = z.infer<typeof EventSchema>;
type Inflation = z.infer<typeof InflationSchema>;

export async function updateIntervention(db: DbClient, procedureId: string, interventionId: string, v: InterventionDetail): Promise<Result> {
  const { data: current, error: re } = await db
    .from("interventions")
    .select("id, guidewire, lesion:vessel_findings!interventions_vessel_finding_id_procedure_id_fkey(bifurcation)")
    .eq("id", interventionId)
    .eq("procedure_id", procedureId)
    .maybeSingle();
  if (re) return { error: re };
  if (!current) return NOT_FOUND;
  // A bifurcation strategy belongs to a bifurcation lesion only (spec §2.8).
  const bifurcation = (current.lesion as { bifurcation: boolean } | null)?.bifurcation ?? false;
  const fields = {
    ...v,
    bifurcation_strategy: bifurcation ? v.bifurcation_strategy : null,
    bifurcation_strategy_other: bifurcation ? v.bifurcation_strategy_other : null,
    // Old home: the first wire is still the Week 1 guidewire (never emptied: it is NOT NULL).
    guidewire: v.wires[0] ?? current.guidewire,
  };
  const { data, error } = await db.from("interventions").update(fields).eq("id", interventionId).eq("procedure_id", procedureId).select("id");
  return error ? { error } : one(data);
}

export async function saveEvent(db: DbClient, procedureId: string, e: EventInput): Promise<Result> {
  const { id, ...fields } = e;
  if (id) {
    const { data, error } = await db.from("complications").update(fields).eq("id", id).eq("procedure_id", procedureId).select("id");
    return error ? { error } : one(data);
  }
  const { error } = await db.from("complications").insert({ ...fields, procedure_id: procedureId });
  return { error };
}

export async function deleteEvent(db: DbClient, procedureId: string, id: string): Promise<Result> {
  const { data, error } = await db.from("complications").delete().eq("id", id).eq("procedure_id", procedureId).select("id");
  return error ? { error } : one(data);
}

/** The device exists and belongs to an intervention of this procedure. */
async function deviceOf(db: DbClient, procedureId: string, deviceId: string) {
  const { data, error } = await db.from("devices_used").select("id, intervention:interventions!inner(procedure_id)").eq("id", deviceId).eq("intervention.procedure_id", procedureId).maybeSingle();
  return { device: data, error };
}

export async function addInflation(db: DbClient, procedureId: string, f: Inflation): Promise<Result> {
  const { device, error: de } = await deviceOf(db, procedureId, f.device_id);
  if (de) return { error: de };
  if (!device) return NOT_FOUND;
  const { data: last, error: le } = await db.from("device_inflations").select("sequence").eq("device_id", f.device_id).order("sequence", { ascending: false }).limit(1);
  if (le) return { error: le };
  const sequence = (last?.[0]?.sequence ?? 0) + 1;
  const { error } = await db.from("device_inflations").insert({ ...f, sequence, source: "typed" });
  return { error };
}

export async function deleteInflation(db: DbClient, procedureId: string, deviceId: string, id: string): Promise<Result> {
  const { device, error: de } = await deviceOf(db, procedureId, deviceId);
  if (de) return { error: de };
  if (!device) return NOT_FOUND;
  const { data, error } = await db.from("device_inflations").delete().eq("id", id).eq("device_id", deviceId).select("id");
  return error ? { error } : one(data);
}

// ─── §3.6 Indication and outcomes ──────────────────────────────────────────────

type Indication = z.infer<typeof IndicationSheetSchema>;
type Outcome = z.infer<typeof OutcomeSheetSchema>;

export async function updateIndication(db: DbClient, procedureId: string, v: Indication): Promise<Result> {
  const { data, error } = await db.from("procedures").update(v).eq("id", procedureId).select("id");
  return error ? { error } : one(data);
}

const DIED_WITH_DISCHARGE: Result = { error: { code: "P0001", message: "death with discharge", hint: "hrudaya:outcome_death_discharged" } };

/**
 * A death also sets the procedure's condition to deceased (spec §2.11 rule). The two are separate
 * requests, so: refuse up front if a discharge exists (nothing changed), set the condition, save the
 * outcome, and if that is refused put the previous condition back — never a half-saved death.
 */
async function withDeathCondition(db: DbClient, procedureId: string, death: boolean, save: () => Promise<{ error: DbError }>): Promise<Result> {
  if (!death) return save();
  const { data: before, error: be } = await db.from("procedures").select("post_procedure_condition, discharge:discharges(id)").eq("id", procedureId).maybeSingle();
  if (be) return { error: be };
  if (!before) return NOT_FOUND;
  if (before.discharge) return DIED_WITH_DISCHARGE;
  const set = await db.from("procedures").update({ post_procedure_condition: "deceased" }).eq("id", procedureId).select("id");
  if (set.error) return { error: set.error };
  if ((set.data ?? []).length !== 1) return NOT_FOUND;
  const res = await save();
  if (res.error && before.post_procedure_condition !== "deceased") {
    await db.from("procedures").update({ post_procedure_condition: before.post_procedure_condition }).eq("id", procedureId);
  }
  return res;
}

/** Outcomes are one row per procedure; event_links are kept (not part of the sheet's payload). */
export async function saveOutcomes(db: DbClient, procedureId: string, v: Outcome): Promise<Result> {
  return withDeathCondition(db, procedureId, v.death === "yes", async () =>
    db.from("in_hospital_outcomes").upsert({ ...v, procedure_id: procedureId, source: "picked" }, { onConflict: "procedure_id" }),
  );
}

/**
 * "Record as outcome" (spec §3.5): set the outcome to yes and link the event, so it is entered once.
 * A vascular outcome also adds its complication type.
 */
export async function recordEventAsOutcome(
  db: DbClient,
  procedureId: string,
  eventId: string,
  key: OutcomeKey,
  vascular: Enums["vascular_complication"] | null,
): Promise<Result> {
  const { data: ev, error: ee } = await db.from("complications").select("id").eq("id", eventId).eq("procedure_id", procedureId).maybeSingle();
  if (ee) return { error: ee };
  if (!ev) return NOT_FOUND;
  const { data: current, error: ce } = await db.from("in_hospital_outcomes").select("event_links, vascular_complications").eq("procedure_id", procedureId).maybeSingle();
  if (ce) return { error: ce };
  const links = [...new Set([...(current?.event_links ?? []), eventId])];
  const patch: Record<string, unknown> = { [key]: "yes", event_links: links };
  if (key === "vascular_status") {
    if (!vascular) return { error: { code: "22004", message: "vascular type missing", hint: "hrudaya:outcome_vascular_type" } };
    patch.vascular_complications = [...new Set([...(current?.vascular_complications ?? []), vascular])];
  }
  if (key === "death") patch.disposition = "deceased";
  return withDeathCondition(db, procedureId, key === "death", async () =>
    db.from("in_hospital_outcomes").upsert({ ...patch, procedure_id: procedureId }, { onConflict: "procedure_id" }),
  );
}
