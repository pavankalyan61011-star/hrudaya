import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { loadProcedureForFhir } from "@/lib/fhir/load";
import { closeAmendment, type OpenAmendment } from "@/lib/amendments/api";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * Close the open amendment: re-review with the second signature (Week 6 spec §2, §4). The server
 * recomputes the list of changes and stores it only if it equals the list the clinician signed;
 * close_amendment then refuses a list that contradicts the record and an incomplete record.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = createClient();
  const body = await request.json().catch(() => null);
  const result = await closeAmendment(params.id, body, {
    getUser: getCurrentUser,
    load: (id) => loadProcedureForFhir(db, id),
    loadOpen: async (id) => {
      const { data, error } = await db
        .from("procedure_amendments")
        .select("id, amendment_no, snapshot")
        .eq("procedure_id", id)
        .eq("status", "open")
        .maybeSingle();
      return { amendment: (data as unknown as OpenAmendment | null) ?? null, error };
    },
    close: async (id, clinicianId, changes) => {
      const { error } = await db.rpc("close_amendment", {
        p_procedure_id: id,
        p_reviewing_clinician_id: clinicianId,
        p_changes: changes as unknown as Json,
      });
      return { error };
    },
  });
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
