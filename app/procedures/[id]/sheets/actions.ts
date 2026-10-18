"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { getDraftHeader } from "@/lib/queries/procedures";
import { friendlyError } from "@/lib/queries/errors";
import { updateLesion } from "@/lib/queries/sheets";
import { LesionSheetSchema, fieldErrors } from "@/lib/validation/capture";

// Week 7 sheets (spec §3). Nothing in this file logs; errors carry no row data.

export type SheetState = { error?: string; fieldErrors?: Record<string, string> };

const SIGNED_OUT = "Your session has ended. Sign in again — this sheet was not saved.";
const CHECK_FIELDS = "Please fix the highlighted fields.";
const READ_ONLY = "This record can't be changed here. A reviewed record is corrected by opening an amendment from its report.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readPayload(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("payload") ?? "null"));
  } catch {
    return null;
  }
}

/** The sheets edit a draft, or a reviewed record with an open amendment — the same rule as the capture form. */
async function requireEditable(formData: FormData) {
  const id = String(formData.get("procedure_id") ?? "");
  const row = String(formData.get("row_id") ?? "");
  if (!UUID.test(id) || !UUID.test(row)) return { db: null, id, row, error: "This record could not be found." };
  const db = createClient();
  const { draft, error } = await getDraftHeader(db, id);
  if (error || !draft) return { db: null, id, row, error: "This record could not be found." };
  const status = draft.status as string;
  if (status !== "draft" && status !== "amending") return { db: null, id, row, error: READ_ONLY };
  return { db, id, row, error: null };
}

/** §3.1 Lesion sheet. On success the sheet closes (back to the report, the row in view). */
export async function saveLesionSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = LesionSheetSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, id, row, error } = await requireEditable(formData);
  if (error || !db) return { error: error ?? undefined };

  const res = await updateLesion(db, id, row, parsed.data);
  if (res.error) return { error: friendlyError(res.error) };
  redirect(`/procedures/${id}#lesion-${row}`);
}
