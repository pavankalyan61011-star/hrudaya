import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { loadProcedureForFhir } from "@/lib/fhir/load";
import { saveSummary } from "@/lib/summary/api";

export const dynamic = "force-dynamic";

/**
 * Save the clinician's edit, or approve (Week 4 spec §6). The audit re-runs on the edited text and
 * an error flag refuses approval (422). The update trigger stamps approved_by and approved_at and
 * makes an approved row immutable; RLS lets updates reach drafts only. Never logs the text.
 */
export async function PUT(request: Request, { params }: { params: { id: string; summaryId: string } }) {
  const db = createClient();
  const body = await request.json().catch(() => null);

  const result = await saveSummary(params.id, params.summaryId, body, {
    getUser: getCurrentUser,
    loadSummary: async (summaryId) => {
      const { data, error } = await db.from("discharge_summaries").select("*").eq("id", summaryId).maybeSingle();
      return { summary: data, error };
    },
    load: (id) => loadProcedureForFhir(db, id),
    update: async (summaryId, patch) => {
      const { data, error } = await db
        .from("discharge_summaries")
        .update(patch)
        .eq("id", summaryId)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      return { row: data, error };
    },
    log: (e) => console.info(JSON.stringify(e)),
  });

  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
