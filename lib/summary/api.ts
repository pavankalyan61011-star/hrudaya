/**
 * Decision logic for the two summary routes (Week 4 spec §6), kept free of Next so it can be
 * unit-tested with fakes. The routes pass the signed-in user's Supabase client (RLS applies) and
 * the real model call. Nothing here logs input or draft text: log events carry ids, language,
 * version, tokens, latency and flag codes only.
 *
 * POST /api/procedures/[id]/summary { language }
 *   401 not signed in · 400 bad body · 404 unknown procedure · 409 not reviewed / no discharge /
 *   version race · 503 key unset or AI busy · 429 ≥ 20 generated today (IST) · 502 model refused,
 *   cut off or failed · 500 could not load or save · 201 the stored row
 *
 * PUT /api/procedures/[id]/summary/[summaryId] { approved_text, approving_clinician_id, approve }
 *   401 · 400 bad body / unknown clinician · 404 unknown summary · 409 already approved, or the
 *   record changed since the draft · 422 approved_text has an error flag · 500 · 200 the row.
 *   approve: false saves the edit and leaves the summary a draft (spec §1: "save edit / approve").
 */
import { z } from "zod";
import type { FhirSource } from "../fhir/load.ts";
import type { DbError } from "../queries/errors.ts";
import { buildSummaryInput, inputHash } from "./input.ts";
import { isSummaryLanguage, PROMPT_VERSION, type SummaryLanguage } from "./prompt.ts";
import { auditDraft, hasErrors, type AuditFlag } from "./audit.ts";
import { draftSummary, SummaryModelError, type Draft, type ModelCall, type SummaryRow } from "./generate.ts";

export const DAILY_CAP = 20;

/**
 * A summary as it leaves the server: the row without `model`. No AI vendor or model name may reach
 * a patient or clinician, including in page data or API responses (owner, 2026-10-15). The model
 * stays on the database row for provenance.
 */
export type ClientSummary = Omit<SummaryRow, "model">;
export function toClientSummary(row: SummaryRow): ClientSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { model, ...rest } = row;
  return rest;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LogEvent =
  | { event: "summary_generated"; procedure_id: string; language: SummaryLanguage; version: number; tokens_in: number; tokens_out: number; latency_ms: number; model: string; flags: string[] }
  | { event: "summary_failed"; procedure_id: string; language: SummaryLanguage; kind: string; latency_ms: number }
  | { event: "summary_approved"; procedure_id: string; summary_id: string; language: SummaryLanguage; version: number; flags: string[] };

type Load = (procedureId: string) => Promise<{ procedure: FhirSource | null; error: unknown }>;

export type GenerateDeps = {
  getUser: () => Promise<{ id: string } | null>;
  configured: () => boolean;
  load: Load;
  /** Rows this user generated since midnight IST. */
  countToday: (userId: string) => Promise<{ count: number | null; error: unknown }>;
  /** Created only after every other check passes; throws SummaryModelError("not_configured") without a key. */
  modelCall: () => ModelCall;
  save: (row: { procedure_id: string; language: SummaryLanguage; input_hash: string; prompt_version: string } & Draft) => Promise<{ row: SummaryRow | null; error: DbError }>;
  log: (e: LogEvent) => void;
  clock?: () => number;
};

export type ApiResult =
  | { status: 200 | 201; body: { summary: ClientSummary; flags?: AuditFlag[] } }
  | { status: 400 | 401 | 404 | 409 | 422 | 429 | 500 | 502 | 503; body: { error: string; flags?: AuditFlag[] } };

const fail = (status: Exclude<ApiResult["status"], 200 | 201>, error: string, flags?: AuditFlag[]): ApiResult => ({
  status,
  body: flags ? { error, flags } : { error },
});

/** Why this procedure cannot have a summary, or null if it can. */
import { AMENDING_BLOCKER } from "./blocker.ts";
export { AMENDING_BLOCKER };

export function summaryBlocker(p: Pick<FhirSource, "status" | "discharge">): string | null {
  if ((p.status as string) === "amending") return AMENDING_BLOCKER; // Week 6
  if (p.status !== "reviewed") return "A discharge summary is available after clinical review.";
  if (!p.discharge) return "A discharge summary is available after discharge is recorded.";
  return null;
}

function saveErrorResult(error: DbError): ApiResult {
  switch (error?.hint) {
    case "hrudaya:summary_needs_reviewed":
      return fail(409, "A discharge summary is available after clinical review.");
    case "hrudaya:summary_needs_discharge":
      return fail(409, "A discharge summary is available after discharge is recorded.");
    case "hrudaya:summary_approved_immutable":
      return fail(409, "This summary is already approved. Regenerate to make a new version.");
  }
  if (error?.code === "23505") return fail(409, "Another version was created at the same moment. Reload and try again.");
  if (error?.code === "23503") return fail(400, "Choose an approving clinician from the list.");
  return fail(500, "Could not save the summary. Please try again.");
}

export async function generateSummary(procedureId: string, body: unknown, deps: GenerateDeps): Promise<ApiResult> {
  const clock = deps.clock ?? Date.now;
  const user = await deps.getUser();
  if (!user) return fail(401, "Sign in to generate a summary.");

  const language = (body as { language?: unknown } | null)?.language;
  if (!isSummaryLanguage(language)) return fail(400, "Choose a language: en, te, hi, ta, kn or ml.");
  if (!UUID.test(procedureId)) return fail(404, "Procedure not found.");

  const { procedure, error } = await deps.load(procedureId);
  if (error) return fail(500, "Could not load the procedure.");
  if (!procedure) return fail(404, "Procedure not found.");
  const blocker = summaryBlocker(procedure);
  if (blocker) return fail(409, blocker);

  if (!deps.configured()) return fail(503, "AI summary is not configured on this server.");

  const today = await deps.countToday(user.id);
  if (today.error || today.count === null) return fail(500, "Could not check today's summary count.");
  if (today.count >= DAILY_CAP) return fail(429, `You have generated ${DAILY_CAP} summaries today, the daily limit. Try again tomorrow.`);

  const input = buildSummaryInput(procedure);
  const started = clock();
  let draft: Draft;
  try {
    draft = await draftSummary(input, language, deps.modelCall());
  } catch (e) {
    const kind = e instanceof SummaryModelError ? e.kind : "failed";
    deps.log({ event: "summary_failed", procedure_id: procedureId, language, kind, latency_ms: clock() - started });
    if (kind === "not_configured") return fail(503, "AI summary is not configured on this server.");
    if (kind === "rate_limited") return fail(503, "The AI service is busy. Try again in a minute.");
    if (kind === "refused") return fail(502, "The AI declined to draft this summary. Write it by hand, or try again.");
    if (kind === "truncated") return fail(502, "The draft was too long and was cut off, so it was not saved. Try again.");
    return fail(502, "Could not draft the summary. Please try again.");
  }
  const latency_ms = clock() - started;

  const saved = await deps.save({ procedure_id: procedureId, language, input_hash: inputHash(input), prompt_version: PROMPT_VERSION, ...draft });
  if (saved.error || !saved.row) return saved.error ? saveErrorResult(saved.error) : fail(500, "Could not save the summary.");

  deps.log({
    event: "summary_generated",
    procedure_id: procedureId,
    language,
    version: saved.row.version,
    tokens_in: draft.tokens_in,
    tokens_out: draft.tokens_out,
    latency_ms,
    model: draft.model,
    flags: draft.audit_flags.map((f) => f.code),
  });
  return { status: 201, body: { summary: toClientSummary(saved.row) } };
}

// ─── PUT: save edit / approve ────────────────────────────────────────────────

const ApproveBody = z
  .object({
    approved_text: z.string().trim().min(1, "The summary text is empty.").max(20_000, "The summary text is too long."),
    approving_clinician_id: z.string().regex(UUID).nullish(),
    approve: z.boolean(),
  })
  .refine((b) => !b.approve || !!b.approving_clinician_id, { message: "Choose the approving clinician.", path: ["approving_clinician_id"] });

export type ApproveDeps = {
  getUser: () => Promise<{ id: string } | null>;
  loadSummary: (summaryId: string) => Promise<{ summary: SummaryRow | null; error: unknown }>;
  load: Load;
  update: (
    summaryId: string,
    patch: { approved_text: string; approving_clinician_id: string | null; status: "draft" | "approved" },
  ) => Promise<{ row: SummaryRow | null; error: DbError }>;
  log: (e: LogEvent) => void;
};

export async function saveSummary(procedureId: string, summaryId: string, body: unknown, deps: ApproveDeps): Promise<ApiResult> {
  const user = await deps.getUser();
  if (!user) return fail(401, "Sign in to approve a summary.");
  if (!UUID.test(procedureId) || !UUID.test(summaryId)) return fail(404, "Summary not found.");

  const parsed = ApproveBody.safeParse(body);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const { approved_text, approve } = parsed.data;
  const approving_clinician_id = parsed.data.approving_clinician_id ?? null;

  const { summary, error } = await deps.loadSummary(summaryId);
  if (error) return fail(500, "Could not load the summary.");
  if (!summary || summary.procedure_id !== procedureId) return fail(404, "Summary not found.");
  if (summary.status === "approved") return fail(409, "This summary is already approved. Regenerate to make a new version.");

  const loaded = await deps.load(procedureId);
  if (loaded.error) return fail(500, "Could not load the procedure.");
  if (!loaded.procedure) return fail(404, "Procedure not found.");
  const input = buildSummaryInput(loaded.procedure);
  if (inputHash(input) !== summary.input_hash) {
    return fail(409, "The record has changed since this draft was generated. Regenerate before approving.");
  }

  // Spec §5.2: the audit re-runs on the clinician's text; an error flag blocks approval.
  const flags = auditDraft(input, approved_text, summary.language);
  if (approve && hasErrors(flags)) {
    return fail(422, "Fix the errors flagged below before approving.", flags);
  }

  const { row, error: updateError } = await deps.update(summaryId, {
    approved_text,
    approving_clinician_id,
    status: approve ? "approved" : "draft",
  });
  if (updateError) return saveErrorResult(updateError);
  // RLS lets an update touch drafts only: no row back means it was approved in the meantime.
  if (!row) return fail(409, "This summary is already approved. Regenerate to make a new version.");

  if (approve) {
    deps.log({ event: "summary_approved", procedure_id: procedureId, summary_id: summaryId, language: summary.language, version: summary.version, flags: flags.map((f) => f.code) });
  }
  return { status: 200, body: { summary: toClientSummary(row), flags } };
}
