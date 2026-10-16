/**
 * Decision logic for opening and closing an amendment (Week 6 spec §2, §4), free of Next so it can
 * be unit-tested with fakes. The routes pass the signed-in user's Supabase client (RLS applies; the
 * SQL functions are security definer and check the user themselves). No service role.
 *
 * POST /api/procedures/[id]/amendments { reason }
 *   401 not signed in · 404 unknown procedure · 422 reason under 10 characters ·
 *   409 not reviewed / an amendment already open · 500 · 201 { amendment_id }
 *
 * POST /api/procedures/[id]/amendments/close { reviewing_clinician_id, changes }
 *   401 · 404 · 422 bad body / no such clinician / record incomplete ·
 *   409 no amendment open, or the record changed since the list was shown (fresh list returned) ·
 *   500 · 200 { changes }
 * The server never stores the client's list as given: it recomputes the diff from the snapshot and
 * the current record, and stores its own only if it equals what the clinician was shown.
 */
import type { FhirSource } from "../fhir/load.ts";
import type { DbError } from "../queries/errors.ts";
import { friendlyError } from "../queries/errors.ts";
import { canonicalJson, snapshotProcedure, type Snapshot } from "./snapshot.ts";
import { diffSnapshots, type Change } from "./diff.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_REASON = 10;

export type AmendResult =
  | { status: 200 | 201; body: { amendment_id?: string; changes?: Change[] } }
  | { status: 400 | 401 | 404 | 409 | 422 | 500; body: { error: string; changes?: Change[] } };

const fail = (status: Exclude<AmendResult["status"], 200 | 201>, error: string, changes?: Change[]): AmendResult => ({
  status,
  body: changes ? { error, changes } : { error },
});

function sqlError(error: DbError): AmendResult {
  switch (error?.hint) {
    case "hrudaya:amendment_needs_user":
      return fail(401, "Sign in to amend a procedure.");
    case "hrudaya:procedure_not_found":
      return fail(404, "Procedure not found.");
    case "hrudaya:amendment_reason_too_short":
      return fail(422, `Give a reason of at least ${MIN_REASON} characters.`);
    case "hrudaya:amend_needs_reviewed":
      return fail(409, "Only a reviewed procedure can be amended. If an amendment is already open, continue it.");
    case "hrudaya:amendment_not_open":
      return fail(409, "There is no open amendment for this procedure.");
    case "hrudaya:amendment_diff_mismatch":
      return fail(409, "The record changed while you were reviewing it. Check the changes again.");
    case "hrudaya:amendment_needs_clinician":
      return fail(422, "Choose the re-reviewing clinician.");
    case "hrudaya:no_vessel_findings":
    case "hrudaya:pci_without_intervention":
    case "hrudaya:diagnostic_with_intervention":
      return fail(422, friendlyError(error));
  }
  if (error?.code === "P0002") return fail(404, "Procedure not found.");
  if (error?.code === "23505") return fail(409, "An amendment was opened at the same moment. Reload the page.");
  if (error?.code === "23503") return fail(422, "Choose the re-reviewing clinician from the list.");
  if (error?.code === "23514") return fail(422, friendlyError(error));
  return fail(500, "Could not save. Please try again.");
}

// ─── Open ─────────────────────────────────────────────────────────────────────

export type OpenDeps = {
  getUser: () => Promise<{ id: string } | null>;
  /** public.open_amendment through the user's client. */
  open: (procedureId: string, reason: string) => Promise<{ id: string | null; error: DbError }>;
};

export async function openAmendment(procedureId: string, body: unknown, deps: OpenDeps): Promise<AmendResult> {
  if (!(await deps.getUser())) return fail(401, "Sign in to amend a procedure.");
  if (!UUID.test(procedureId)) return fail(404, "Procedure not found.");
  const reason = typeof (body as { reason?: unknown } | null)?.reason === "string" ? (body as { reason: string }).reason.trim() : "";
  if (reason.length < MIN_REASON) return fail(422, `Give a reason of at least ${MIN_REASON} characters.`);

  const { id, error } = await deps.open(procedureId, reason);
  if (error || !id) return sqlError(error ?? { message: "no id" });
  return { status: 201, body: { amendment_id: id } };
}

// ─── Close ────────────────────────────────────────────────────────────────────

export type OpenAmendment = { id: string; amendment_no: number; snapshot: Snapshot };

export type CloseDeps = {
  getUser: () => Promise<{ id: string } | null>;
  load: (procedureId: string) => Promise<{ procedure: FhirSource | null; error: unknown }>;
  loadOpen: (procedureId: string) => Promise<{ amendment: OpenAmendment | null; error: unknown }>;
  /** public.close_amendment through the user's client. */
  close: (procedureId: string, clinicianId: string, changes: Change[]) => Promise<{ error: DbError }>;
};

/** The changes an open amendment would sign right now (used by the page and by close). */
export function currentChanges(amendment: OpenAmendment, procedure: FhirSource): Change[] {
  return diffSnapshots(amendment.snapshot, snapshotProcedure(procedure));
}

export async function closeAmendment(procedureId: string, body: unknown, deps: CloseDeps): Promise<AmendResult> {
  if (!(await deps.getUser())) return fail(401, "Sign in to re-review a procedure.");
  if (!UUID.test(procedureId)) return fail(404, "Procedure not found.");
  const b = (body ?? {}) as { reviewing_clinician_id?: unknown; changes?: unknown };
  if (typeof b.reviewing_clinician_id !== "string" || !UUID.test(b.reviewing_clinician_id)) return fail(422, "Choose the re-reviewing clinician.");
  if (!Array.isArray(b.changes)) return fail(422, "The list of changes is missing.");

  const { procedure, error } = await deps.load(procedureId);
  if (error) return fail(500, "Could not load the procedure.");
  if (!procedure) return fail(404, "Procedure not found.");
  if ((procedure.status as string) !== "amending") return fail(409, "There is no open amendment for this procedure.");
  const open = await deps.loadOpen(procedureId);
  if (open.error) return fail(500, "Could not load the amendment.");
  if (!open.amendment) return fail(409, "There is no open amendment for this procedure.");

  const changes = currentChanges(open.amendment, procedure);
  if (canonicalJson(changes) !== canonicalJson(b.changes)) {
    return fail(409, "The record changed since this list was shown. Check the changes again before signing.", changes);
  }

  const { error: closeError } = await deps.close(procedureId, b.reviewing_clinician_id, changes);
  if (closeError) return sqlError(closeError);
  return { status: 200, body: { changes } };
}
