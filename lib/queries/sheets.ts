/**
 * Saves for the Week 7 report sheets (spec §3). Each writes through the signed-in user's client, so
 * RLS and the reviewed-record guard apply; an update that matches no row (wrong procedure, or a row
 * RLS hides) is reported as an error, never as success.
 */
import type { DbClient } from "@/lib/supabase/types";
import type { LesionSheetInput } from "@/lib/validation/capture";
import type { DbError } from "./errors";

type Result = { error: DbError };

/** §3.1: one vessel finding's full lesion detail. */
export async function updateLesion(db: DbClient, procedureId: string, vesselFindingId: string, fields: LesionSheetInput): Promise<Result> {
  const { data, error } = await db
    .from("vessel_findings")
    .update(fields)
    .eq("id", vesselFindingId)
    .eq("procedure_id", procedureId)
    .select("id");
  if (error) return { error };
  if ((data ?? []).length !== 1) return { error: { code: "P0002", message: "lesion not found" } };
  return { error: null };
}
