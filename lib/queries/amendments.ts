import type { DbClient } from "@/lib/supabase/types";
import type { Change } from "@/lib/amendments/diff";
import type { AmendmentView } from "@/components/amendments/amendments-card";

/** Every amendment of a procedure, oldest first, with the re-reviewing clinician's name. */
export async function listAmendments(db: DbClient, procedureId: string) {
  const { data, error } = await db
    .from("procedure_amendments")
    .select("id, amendment_no, status, reason, opened_at, opened_by, closed_at, closed_by, changes, reviewer:operators!procedure_amendments_reviewing_clinician_id_fkey(full_name)")
    .eq("procedure_id", procedureId)
    .order("amendment_no");
  return { amendments: data ?? [], error };
}

/**
 * For display. Who opened or closed an amendment is an auth user id; the app cannot read other users'
 * names, so the signed-in user is shown as "you (email)" and anyone else as "another user"
 * (backlog: user display names).
 */
export function toAmendmentViews(
  rows: Awaited<ReturnType<typeof listAmendments>>["amendments"],
  me: { id: string; email?: string | null } | null,
): AmendmentView[] {
  const who = (id: string | null) => (id && me && id === me.id ? `you${me.email ? ` (${me.email})` : ""}` : id ? "another user" : "not recorded");
  return rows.map((r) => ({
    id: r.id,
    amendment_no: r.amendment_no,
    status: r.status,
    reason: r.reason,
    opened_at: r.opened_at,
    opened_by_label: who(r.opened_by),
    closed_at: r.closed_at,
    closed_by_label: r.closed_by ? who(r.closed_by) : null,
    reviewing_clinician: (r.reviewer as { full_name: string } | null)?.full_name ?? null,
    changes: (r.changes as unknown as Change[] | null) ?? null,
  }));
}
