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
  table: "vessel_findings" | "interventions" | "complications" | "discharge_medications",
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
  phase: Enums["device_phase"];
  category: Enums["device_category"];
  product_name: string;
  manufacturer: string | null;
  diameter_mm: number;
  length_mm: number;
  inflation_atm: number | null;
  lot_number: string | null;
  quantity: number;
};

export type InterventionInput = {
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

/** Replace: insert the new set first; only when all of it saved, remove the old set. */
export async function saveInterventions(db: DbClient, procedureId: string, items: InterventionInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from("interventions").select("id").eq("procedure_id", procedureId);
  if (readError) return { error: readError };

  const created: string[] = [];
  for (const { devices, ...fields } of items) {
    const { data, error } = await db
      .from("interventions")
      .insert({ ...fields, procedure_id: procedureId })
      .select("id")
      .single();
    if (error) {
      await deleteByIds(db, "interventions", created);
      return { error };
    }
    created.push(data.id);
    if (devices.length > 0) {
      const { error: devError } = await db.from("devices_used").insert(devices.map((d) => ({ ...d, intervention_id: data.id })));
      if (devError) {
        await deleteByIds(db, "interventions", created);
        return { error: devError };
      }
    }
  }
  return deleteByIds(db, "interventions", (existing ?? []).map((e) => e.id));
}

// ─── Step 5: complications ─────────────────────────────────────────────────────

export type ComplicationInput = {
  complication: Enums["complication_type"];
  severity: Enums["complication_severity"];
  management: string;
};

export async function saveComplications(db: DbClient, procedureId: string, items: ComplicationInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from("complications").select("id").eq("procedure_id", procedureId);
  if (readError) return { error: readError };
  if (items.length > 0) {
    const { data, error } = await db
      .from("complications")
      .insert(items.map((c) => ({ ...c, procedure_id: procedureId })))
      .select("id");
    if (error) return { error };
    if ((data ?? []).length !== items.length) return { error: { message: "insert incomplete" } };
  }
  return deleteByIds(db, "complications", (existing ?? []).map((e) => e.id));
}

// ─── Step 6: discharge ─────────────────────────────────────────────────────────

export type MedicationInput = {
  drug_name: string;
  dose: number;
  dose_unit: Enums["dose_unit"];
  frequency: Enums["dose_frequency"];
  route: Enums["medication_route"];
  duration: string | null;
  purpose: string | null;
  is_dapt: boolean;
};

export type DischargeInput = {
  discharge_date: string;
  length_of_stay_hours: number;
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
