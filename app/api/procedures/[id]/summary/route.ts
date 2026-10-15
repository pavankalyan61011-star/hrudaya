import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { loadProcedureForFhir } from "@/lib/fhir/load";
import { todayIST } from "@/lib/dates";
import { generateSummary } from "@/lib/summary/api";
import { createModelCall, saveDraft, summaryConfigured } from "@/lib/summary/generate";

export const dynamic = "force-dynamic";
// Drafting takes 10–30 s; the default function limit is shorter.
export const maxDuration = 60;

/**
 * Generate a discharge-summary draft (Week 4 spec §6). A route handler has no layout, so it
 * checks the session itself; all reads and the insert use the user's own client, so RLS applies.
 * Logs ids, language, version, tokens, latency and flag codes — never the input or the draft.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = createClient();
  const body = await request.json().catch(() => null);

  const result = await generateSummary(params.id, body, {
    getUser: getCurrentUser,
    configured: summaryConfigured,
    load: (id) => loadProcedureForFhir(db, id),
    countToday: async (userId) => {
      const { count, error } = await db
        .from("discharge_summaries")
        .select("id", { count: "exact", head: true })
        .eq("generated_by", userId)
        .gte("generated_at", `${todayIST()}T00:00:00+05:30`);
      return { count, error };
    },
    modelCall: () => createModelCall(),
    save: (row) => saveDraft(db, row),
    log: (e) => console.info(JSON.stringify(e)),
  });

  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
