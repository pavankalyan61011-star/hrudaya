import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { loadProcedureForFhir } from "@/lib/fhir/load";
import { exportProcedure } from "@/lib/fhir/export";

export const dynamic = "force-dynamic";

/**
 * FHIR R4 document Bundle for one procedure. A route handler has no layout, so it checks the
 * session itself; the data is then read with the user's own client, so RLS applies.
 * `?download=1` adds Content-Disposition for the Export button.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = createClient();
  const result = await exportProcedure(params.id, {
    getUser: getCurrentUser,
    load: (id) => loadProcedureForFhir(db, id),
    now: () => new Date().toISOString(),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/fhir+json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (result.status === 200 && new URL(request.url).searchParams.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename="${result.filename}"`;
  }
  return new Response(JSON.stringify(result.body, null, 2), { status: result.status, headers });
}
