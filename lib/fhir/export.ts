/**
 * Decision logic for GET /api/fhir/procedures/[id], kept free of Next so it can be unit-tested.
 * The route passes real dependencies; tests pass fakes. Nothing here logs.
 *
 *   401 not signed in · 404 unknown or malformed id · 409 still a draft
 *   500 could not load · 200 FHIR document Bundle
 * Spec §9: only a draft is refused. A completed (not yet reviewed) procedure exports with
 * Composition.status = preliminary; a reviewed one with final.
 */
import type { Bundle, OperationOutcome } from "fhir/r4";
import type { FhirSource } from "./load.ts";
import { procedureToBundle } from "./mapper.ts";

export type ExportDeps = {
  getUser: () => Promise<{ id: string } | null>;
  load: (procedureId: string) => Promise<{ procedure: FhirSource | null; error: unknown }>;
  now: () => string;
};

export type ExportResult =
  | { status: 200; body: Bundle; filename: string }
  | { status: 401 | 404 | 409 | 500; body: OperationOutcome };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const outcome = (code: "login" | "not-found" | "business-rule" | "exception", diagnostics: string): OperationOutcome => ({
  resourceType: "OperationOutcome",
  issue: [{ severity: "error", code, diagnostics }],
});

export async function exportProcedure(procedureId: string, deps: ExportDeps): Promise<ExportResult> {
  if (!(await deps.getUser())) return { status: 401, body: outcome("login", "Sign in to export.") };
  if (!UUID.test(procedureId)) return { status: 404, body: outcome("not-found", "Procedure not found.") };

  const { procedure, error } = await deps.load(procedureId);
  if (error) return { status: 500, body: outcome("exception", "Could not load the procedure.") };
  if (!procedure) return { status: 404, body: outcome("not-found", "Procedure not found.") };
  if (procedure.status === "draft") {
    return { status: 409, body: outcome("business-rule", "This procedure is still a draft. Complete it before exporting.") };
  }
  // Week 6: never export a record in the middle of an amendment.
  if (procedure.status === "amending") {
    return { status: 409, body: outcome("business-rule", "An amendment is in progress. Export after it has been re-reviewed.") };
  }

  return { status: 200, body: procedureToBundle(procedure, deps.now()), filename: `${procedure.case_code}.fhir.json` };
}
