/**
 * Loads everything one procedure's FHIR document needs. Server-side only.
 *
 * Pass the signed-in user's Supabase client (route handler) so row-level security applies; the
 * validation script passes a service client. No logging — rows contain patient data.
 */
import type { DbClient } from "../supabase/types";
import { getProcedureFull, type ProcedureFull } from "../queries/procedures.ts";

export type FhirSource = ProcedureFull;

export async function loadProcedureForFhir(db: DbClient, procedureId: string) {
  const { procedure, error } = await getProcedureFull(db, procedureId);
  return { procedure: procedure as FhirSource | null, error };
}
