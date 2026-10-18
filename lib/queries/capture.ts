/**
 * Saves for the capture form steps. Each replaces one step's child rows for a DRAFT procedure.
 * Deletes are allowed by RLS only while the procedure is a draft; RLS refuses silently (0 rows),
 * so every delete checks how many rows it actually removed.
 */
import type { DbClient } from "@/lib/supabase/types";
import type { Enums } from "@/lib/labels";
import type { DbError } from "./errors";

type Result = { error: DbError };

async function deleteByIds(
  db: DbClient,
  table: "vessel_findings" | "interventions" | "devices_used" | "complications" | "discharge_medications" | "procedure_medications",
  ids: string[],
): Promise<Result> {
  if (ids.length === 0) return { error: null };
  const { data, error } = await db.from(table).delete().in("id", ids).select("id");
  if (error) return { error };
  if ((data ?? []).length !== ids.length) return { error: { code: "42501", message: "delete refused" } };
  return { error: null };
}

// ─── Step 3: angiography ───────────────────────────────────────────────────────

export type VesselInput = {
  id?: string;
  vessel: Enums["vessel"];
  segment: Enums["vessel_segment"] | null;
  stenosis_pct: number;
  timi_flow: number;
  is_culprit: boolean;
  lesion_notes: string | null;
  lesion_length_mm: number | null;
  calcification: Enums["calcification_grade"] | null;
  thrombus: boolean;
  bifurcation: boolean;
};

/** Updates rows that kept their id, inserts new ones, removes ones the user deleted. */
export async function saveVessels(db: DbClient, procedureId: string, rows: VesselInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from("vessel_findings").select("id").eq("procedure_id", procedureId);
  if (readError) return { error: readError };

  const keep = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
  const removed = (existing ?? []).map((e) => e.id).filter((id) => !keep.has(id));
  const del = await deleteByIds(db, "vessel_findings", removed);
  if (del.error) return del;

  for (const { id, ...fields } of rows) {
    if (id) {
      const { error } = await db.from("vessel_findings").update(fields).eq("id", id).eq("procedure_id", procedureId);
      if (error) return { error };
    }
  }
  const fresh = rows.filter((r) => !r.id).map(({ id: _id, ...fields }) => ({ ...fields, procedure_id: procedureId }));
  if (fresh.length > 0) {
    const { error } = await db.from("vessel_findings").insert(fresh);
    if (error) return { error };
  }
  return { error: null };
}

// ─── Step 4: interventions and devices ─────────────────────────────────────────

export type DeviceInput = {
  id?: string;
  phase: Enums["device_phase"];
  category: Enums["device_category"];
  product_name: string;
  manufacturer: string | null;
  diameter_mm: number;
  length_mm: number;
  inflation_atm: number | null;
  lot_number: string | null;
  expiry_date: string | null;
  udi: string | null;
  quantity: number;
};

export type InterventionInput = {
  id?: string;
  vessel_finding_id: string;
  intervention_type: Enums["intervention_type"];
  guidewire: string;
  residual_stenosis_pct: number;
  timi_flow_post: number;
  success: boolean;
  dissection: boolean;
  perforation: boolean;
  notes: string | null;
  devices: DeviceInput[];
};

/**
 * Saved interventions and devices are updated in place (only the step's own fields), new ones
 * inserted, removed ones deleted. Week 7: replacing every row on each save would drop each row's
 * detail (techniques, grading), inflation log and the events linked to outcomes.
 */
export async function saveInterventions(db: DbClient, procedureId: string, items: InterventionInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from("interventions").select("id, devices_used(id)").eq("procedure_id", procedureId);
  if (readError) return { error: readError };
  const known = new Map((existing ?? []).map((e) => [e.id, new Set(e.devices_used.map((d) => d.id))]));

  const kept = new Set<string>();
  for (const { id, devices, ...fields } of items) {
    let interventionId = id && known.has(id) ? id : null;
    if (interventionId) {
      const { error } = await db.from("interventions").update(fields).eq("id", interventionId).eq("procedure_id", procedureId);
      if (error) return { error };
    } else {
      const { data, error } = await db.from("interventions").insert({ ...fields, procedure_id: procedureId }).select("id").single();
      if (error) return { error };
      interventionId = data.id;
    }
    kept.add(interventionId);

    const ownDevices = known.get(interventionId) ?? new Set<string>();
    const keptDevices = new Set<string>();
    const fresh = [];
    for (const { id: deviceId, ...d } of devices) {
      if (deviceId && ownDevices.has(deviceId)) {
        const { error } = await db.from("devices_used").update(d).eq("id", deviceId).eq("intervention_id", interventionId);
        if (error) return { error };
        keptDevices.add(deviceId);
      } else {
        fresh.push({ ...d, intervention_id: interventionId });
      }
    }
    if (fresh.length > 0) {
      const { error } = await db.from("devices_used").insert(fresh);
      if (error) return { error };
    }
    const del = await deleteByIds(db, "devices_used", [...ownDevices].filter((d) => !keptDevices.has(d)));
    if (del.error) return del;
  }
  return deleteByIds(db, "interventions", [...known.keys()].filter((id) => !kept.has(id)));
}

// ─── Step 5: complications ─────────────────────────────────────────────────────

export type ComplicationInput = {
  id?: string;
  complication: Enums["complication_type"];
  severity: Enums["complication_severity"];
  management: string;
  onset: Enums["complication_onset"] | null;
  onset_at: string | null;
  outcome: string | null;
};

/** Kept events updated in place (step fields only), so Week 7 treatment, grade and outcome links survive. */
export async function saveComplications(db: DbClient, procedureId: string, items: ComplicationInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from("complications").select("id").eq("procedure_id", procedureId);
  if (readError) return { error: readError };
  const known = new Set((existing ?? []).map((e) => e.id));
  const kept = new Set<string>();
  const fresh = [];
  for (const { id, ...c } of items) {
    if (id && known.has(id)) {
      const { error } = await db.from("complications").update(c).eq("id", id).eq("procedure_id", procedureId);
      if (error) return { error };
      kept.add(id);
    } else {
      fresh.push({ ...c, procedure_id: procedureId });
    }
  }
  if (fresh.length > 0) {
    const { data, error } = await db.from("complications").insert(fresh).select("id");
    if (error) return { error };
    if ((data ?? []).length !== fresh.length) return { error: { message: "insert incomplete" } };
  }
  return deleteByIds(db, "complications", [...known].filter((id) => !kept.has(id)));
}

// ─── Step 5: procedure medications ─────────────────────────────────────────────

export type ProcedureMedicationInput = {
  drug_name: string;
  dose: number | null;
  dose_unit: Enums["dose_unit"] | null;
  route: Enums["medication_route"];
  timing: Enums["medication_timing"];
  administered_at: string | null;
  act_seconds: number | null;
  act_measured_at: string | null;
  notes: string | null;
};

export async function saveProcedureMedications(db: DbClient, procedureId: string, items: ProcedureMedicationInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from("procedure_medications").select("id").eq("procedure_id", procedureId);
  if (readError) return { error: readError };
  if (items.length > 0) {
    const { data, error } = await db
      .from("procedure_medications")
      .insert(items.map((m) => ({ ...m, procedure_id: procedureId })))
      .select("id");
    if (error) return { error };
    if ((data ?? []).length !== items.length) return { error: { message: "insert incomplete" } };
  }
  return deleteByIds(db, "procedure_medications", (existing ?? []).map((e) => e.id));
}

// ─── Step 6: discharge ─────────────────────────────────────────────────────────

export type MedicationInput = {
  drug_name: string;
  dose: number | null; // null only for a PRN medicine
  dose_unit: Enums["dose_unit"] | null; // null exactly when dose is null
  frequency: Enums["dose_frequency"];
  route: Enums["medication_route"];
  duration: string | null;
  purpose: string | null;
  is_dapt: boolean;
};

export type DischargeInput = {
  discharge_date: string; // the IST date of discharged_at, computed by the action
  discharged_at: string;
  dapt_planned_months: number | null;
  dapt_review_date: string | null;
  clinical_status: string;
  follow_up_date: string;
  follow_up_clinic: string;
  advice: string[];
  red_flags: string[];
  medications: MedicationInput[];
};

/** `null` = patient remains admitted: any discharge row on this draft is removed. */
export async function saveDischarge(db: DbClient, procedureId: string, input: DischargeInput | null): Promise<Result> {
  if (input === null) {
    const { error } = await db.from("discharges").delete().eq("procedure_id", procedureId);
    return { error };
  }

  const { medications, ...fields } = input;
  const { data: discharge, error } = await db
    .from("discharges")
    .upsert({ ...fields, procedure_id: procedureId }, { onConflict: "procedure_id" })
    .select("id")
    .single();
  if (error) return { error };

  const { data: existing, error: readError } = await db
    .from("discharge_medications")
    .select("id")
    .eq("discharge_id", discharge.id);
  if (readError) return { error: readError };

  if (medications.length > 0) {
    const { error: medError } = await db
      .from("discharge_medications")
      .insert(medications.map((m) => ({ ...m, discharge_id: discharge.id })));
    if (medError) return { error: medError };
  }
  return deleteByIds(db, "discharge_medications", (existing ?? []).map((e) => e.id));
}
