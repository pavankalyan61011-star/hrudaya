/**
 * Draft a patient discharge summary with the Claude API (Week 4 spec §2, §5). SERVER-SIDE ONLY.
 *
 * Reads ANTHROPIC_API_KEY from the server environment — never NEXT_PUBLIC_, never sent to a
 * browser, never logged. Nothing in this file logs the input or the draft: both carry clinical
 * content. Callers may log ids, language, version, tokens, latency and flag codes only.
 *
 * Request settings, and where they differ from spec §2 (checked against the API docs 2026-10-15):
 *  - max_tokens 4000, not the spec's 1500 (owner decisions 2026-10-15: 3000 after the first eval
 *    sample, then 4000 when the v3 eval's longest Kannada draft used 2938 of 3000). In that sample
 *    Kannada and Malayalam were cut off at 1500 and Tamil used 1485: these scripts take ~5.5
 *    tokens a word, so a complete leaflet needs ~1700–2200. It is a ceiling, not a target —
 *    English still uses ~800. A draft cut off at the limit is refused, never stored: a
 *    truncated leaflet would silently lose its last sections (red flags, follow-up).
 *  - temperature is NOT sent. claude-sonnet-5-5 rejects any non-default sampling value with a 400,
 *    so `temperature: 0` cannot be honoured. It never guaranteed identical output anyway; the
 *    audit, not the sampler, is what holds the draft to the record.
 *  - thinking { type: "between_tools" }: no extended thinking, so the whole token budget is
 *    the draft itself. This is a transcription task over a small JSON record.
 *  - Server-side refusal fallback (`fallbacks: "default"`, beta server-side-fallback-2026-07-01).
 *    If it ever runs, `response.model` names the model that wrote the draft, and that is what is
 *    stored on the row.
 *
 * Type-only imports plus relative `.ts` imports, so the eval script can run it under Node.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SummaryInput } from "./input.ts";
import { buildMessages, SUMMARY_MODEL, type SummaryLanguage } from "./prompt.ts";
import { auditDraft, type AuditFlag } from "./audit.ts";
import type { Database, Json } from "../database.types";
import type { DbClient } from "../supabase/types";
import type { DbError } from "../queries/errors.ts";

if (typeof window !== "undefined") {
  throw new Error("lib/summary/generate.ts is server-only");
}

export const MAX_TOKENS = 4000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type ModelRequest = ReturnType<typeof buildMessages>;
export type ModelReply = {
  text: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  stop_reason: string | null;
};
/** The one seam to the model. Routes and the eval get the real one; tests pass a fake. */
export type ModelCall = (req: ModelRequest) => Promise<ModelReply>;

export type ModelFailure = "not_configured" | "rate_limited" | "refused" | "truncated" | "empty" | "failed";

/** Thrown for every way a model call can fail. `message` never contains input or output text. */
export class SummaryModelError extends Error {
  readonly kind: ModelFailure;
  /** Tokens billed for a call that answered but was refused here (cut off, empty, declined). */
  readonly billed?: { tokens_in: number; tokens_out: number };
  constructor(kind: ModelFailure, message: string, billed?: { tokens_in: number; tokens_out: number }) {
    super(message);
    this.kind = kind;
    this.billed = billed;
    this.name = "SummaryModelError";
  }
}

/** Whether this server can draft at all. Presence only — the value is never read here. */
export const summaryConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** The real model call. Reads the key at call time so a missing key is a 503, not a crash. */
export function createModelCall(apiKey = process.env.ANTHROPIC_API_KEY): ModelCall {
  if (!apiKey) throw new SummaryModelError("not_configured", "ANTHROPIC_API_KEY is not set on this server");
  // One retry: a route has ~60 s, and the SDK's backoff on a second retry would eat it.
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55_000 });

  return async ({ system, messages }) => {
    let response;
    try {
      response = await client.beta.messages.create({
        model: SUMMARY_MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "between_tools" },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system,
        messages,
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new SummaryModelError("rate_limited", "The AI service is busy");
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new SummaryModelError("not_configured", "The AI service rejected this server's key");
      }
      // A 400 names the request parameter at fault (never the prompt text): keep it for diagnosis.
      if (e instanceof Anthropic.BadRequestError) throw new SummaryModelError("failed", `AI service error 400: ${e.message.slice(0, 300)}`);
      if (e instanceof Anthropic.APIError) throw new SummaryModelError("failed", `AI service error ${e.status ?? ""}`.trim());
      throw new SummaryModelError("failed", "Could not reach the AI service");
    }

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return {
      text,
      model: response.model,
      tokens_in: response.usage.input_tokens,
      tokens_out: response.usage.output_tokens,
      stop_reason: response.stop_reason,
    };
  };
}

export type Draft = {
  draft_text: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  audit_flags: AuditFlag[];
};

/**
 * Input → model → audit. Refuses (throws) on a refusal, a truncated draft or an empty one, so a
 * row is only ever stored for a complete draft. Billed tokens of a refused call are on the error.
 */
export async function draftSummary(input: SummaryInput, language: SummaryLanguage, call: ModelCall): Promise<Draft> {
  const reply = await call(buildMessages(input, language));

  const billed = { tokens_in: reply.tokens_in, tokens_out: reply.tokens_out };
  if (reply.stop_reason === "refusal") throw new SummaryModelError("refused", "The model declined to draft this summary", billed);
  if (reply.stop_reason === "max_tokens") {
    throw new SummaryModelError("truncated", `The draft was cut off at ${MAX_TOKENS} tokens and was not saved`, billed);
  }
  if (!reply.text) throw new SummaryModelError("empty", "The model returned no text", billed);

  return {
    draft_text: reply.text,
    model: reply.model,
    tokens_in: reply.tokens_in,
    tokens_out: reply.tokens_out,
    audit_flags: auditDraft(input, reply.text, language),
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export type SummaryRow = Database["public"]["Tables"]["discharge_summaries"]["Row"];

/**
 * Stores a draft as the next version for (procedure, language): version = max + 1. Pass the
 * signed-in user's client so RLS applies and the trigger stamps generated_by. The insert trigger
 * refuses a procedure that is not reviewed or has no discharge. A concurrent insert of the same
 * version fails on the unique key (23505); the caller reports it as a conflict.
 */
export async function saveDraft(
  db: DbClient,
  row: { procedure_id: string; language: SummaryLanguage; input_hash: string; prompt_version: string } & Draft,
): Promise<{ row: SummaryRow | null; error: DbError }> {
  const latest = await db
    .from("discharge_summaries")
    .select("version")
    .eq("procedure_id", row.procedure_id)
    .eq("language", row.language)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) return { row: null, error: latest.error };

  const { data, error } = await db
    .from("discharge_summaries")
    .insert({
      procedure_id: row.procedure_id,
      language: row.language,
      version: (latest.data?.version ?? 0) + 1,
      model: row.model,
      prompt_version: row.prompt_version,
      input_hash: row.input_hash,
      draft_text: row.draft_text,
      audit_flags: row.audit_flags as unknown as Json,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
    })
    .select("*")
    .single();
  return { row: data, error };
}
