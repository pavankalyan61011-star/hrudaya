import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { openAmendment } from "@/lib/amendments/api";

export const dynamic = "force-dynamic";

/**
 * Open an amendment on a reviewed procedure (Week 6 spec §2, §4). A route handler has no layout, so
 * it checks the session itself; the SQL function runs through the user's own client (no service
 * role) and checks the user, the status and the reason again.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = createClient();
  const body = await request.json().catch(() => null);
  const result = await openAmendment(params.id, body, {
    getUser: getCurrentUser,
    open: async (procedureId, reason) => {
      const { data, error } = await db.rpc("open_amendment", { p_procedure_id: procedureId, p_reason: reason });
      return { id: (data as string | null) ?? null, error };
    },
  });
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
