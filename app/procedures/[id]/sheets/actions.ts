"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/auth";
import { getDraftHeader } from "@/lib/queries/procedures";
import { friendlyError } from "@/lib/queries/errors";
import {
  addInflation,
  deleteEvent,
  deleteGraft,
  deleteInflation,
  deleteLesionChild,
  recordEventAsOutcome,
  saveEvent,
  saveGraft,
  saveHaemodynamics,
  saveImaging,
  saveOutcomes,
  savePhysiology,
  updateIndication,
  updateIntervention,
  updateLesion,
} from "@/lib/queries/sheets";
import {
  EventSchema,
  GraftSchema,
  HaemodynamicsSheetSchema,
  ImagingRowSchema,
  IndicationSheetSchema,
  InflationSchema,
  InterventionSheetSchema,
  LesionSheetSchema,
  OutcomeSheetSchema,
  PhysiologyRowSchema,
  fieldErrors,
} from "@/lib/validation/capture";
import { OUTCOME_KEYS, type OutcomeKey } from "@/lib/events";
import { ENUMS, type Enums } from "@/lib/labels";
import type { z } from "zod";

// Week 7 sheets (spec §3). Nothing in this file logs; errors carry no row data.
//
// Single-form sheets close on success (redirect to `return_to`: the report, or the capture step the
// sheet was opened from). List sheets — physiology and imaging rows, grafts, events, inflations —
// stay open: they revalidate the page and return `saved`, and the sheet clears its add form.

export type SheetState = { error?: string; fieldErrors?: Record<string, string>; saved?: number };

const SIGNED_OUT = "Your session has ended. Sign in again — this was not saved.";
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

/** Only a path inside this procedure's own pages; anything else returns to the report. */
function returnPath(formData: FormData, id: string) {
  const to = String(formData.get("return_to") ?? "");
  const own = to === `/procedures/${id}` || to.startsWith(`/procedures/${id}?`) || to.startsWith(`/procedures/new?id=${id}&`);
  return own && !to.includes("//") ? to : `/procedures/${id}`;
}

/** The sheets edit a draft, or a reviewed record with an open amendment — the same rule as the capture form. */
async function requireEditable(formData: FormData) {
  const id = String(formData.get("procedure_id") ?? "");
  if (!UUID.test(id)) return { db: null, id, error: "This record could not be found." };
  const db = createClient();
  const { draft, error } = await getDraftHeader(db, id);
  if (error || !draft) return { db: null, id, error: "This record could not be found." };
  const status = draft.status as string;
  if (status !== "draft" && status !== "amending") return { db: null, id, error: READ_ONLY };
  return { db, id, error: null };
}

const rowId = (formData: FormData, name = "row_id") => {
  const v = String(formData.get(name) ?? "");
  return UUID.test(v) ? v : null;
};

/** Parse, check the record is editable, save; then close (redirect) or stay (revalidate). */
async function run<S extends z.ZodTypeAny>(
  formData: FormData,
  schema: S,
  save: (db: NonNullable<Awaited<ReturnType<typeof requireEditable>>["db"]>, id: string, data: z.infer<S>) => Promise<{ error: unknown }>,
  close: boolean,
): Promise<SheetState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = schema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, id, error } = await requireEditable(formData);
  if (error || !db) return { error: error ?? undefined };
  const res = await save(db, id, parsed.data);
  if (res.error) return { error: friendlyError(res.error as never) };
  if (close) redirect(returnPath(formData, id));
  revalidatePath(`/procedures/${id}`);
  revalidatePath("/procedures/new");
  return { saved: Date.now() };
}

/** Deletes and one-click actions: no payload schema beyond ids. */
async function runSimple(formData: FormData, act: (db: NonNullable<Awaited<ReturnType<typeof requireEditable>>["db"]>, id: string) => Promise<{ error: unknown }>): Promise<SheetState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const { db, id, error } = await requireEditable(formData);
  if (error || !db) return { error: error ?? undefined };
  const res = await act(db, id);
  if (res.error) return { error: friendlyError(res.error as never) };
  revalidatePath(`/procedures/${id}`);
  revalidatePath("/procedures/new");
  return { saved: Date.now() };
}

const MISSING = { error: { code: "P0002", message: "row not found" } };

// §3.1
export async function saveLesionSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const row = rowId(formData);
  return run(formData, LesionSheetSchema, (db, id, data) => (row ? updateLesion(db, id, row, data) : Promise.resolve(MISSING)), true);
}

// §3.2
export async function savePhysiologyRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const row = rowId(formData);
  return run(formData, PhysiologyRowSchema, (db, id, data) => (row ? savePhysiology(db, id, row, data) : Promise.resolve(MISSING)), false);
}
export async function saveImagingRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const row = rowId(formData);
  return run(formData, ImagingRowSchema, (db, id, data) => (row ? saveImaging(db, id, row, data) : Promise.resolve(MISSING)), false);
}
export async function deleteLesionChildRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const row = rowId(formData);
  const child = rowId(formData, "child_id");
  const table = formData.get("table") === "intravascular_imaging" ? "intravascular_imaging" : "lesion_physiology";
  return runSimple(formData, (db, id) => (row && child ? deleteLesionChild(db, id, row, table, child) : Promise.resolve(MISSING)));
}

// §3.3
export async function saveHaemodynamicsSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  return run(formData, HaemodynamicsSheetSchema, saveHaemodynamics, true);
}

// §3.4
export async function saveGraftRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  return run(formData, GraftSchema, saveGraft, false);
}
export async function deleteGraftRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const child = rowId(formData, "child_id");
  return runSimple(formData, (db, id) => (child ? deleteGraft(db, id, child) : Promise.resolve(MISSING)));
}

// §3.5
export async function saveInterventionSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const row = rowId(formData);
  return run(formData, InterventionSheetSchema, (db, id, data) => (row ? updateIntervention(db, id, row, data) : Promise.resolve(MISSING)), true);
}
export async function saveEventRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  return run(formData, EventSchema, saveEvent, false);
}
export async function deleteEventRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const child = rowId(formData, "child_id");
  return runSimple(formData, (db, id) => (child ? deleteEvent(db, id, child) : Promise.resolve(MISSING)));
}
export async function addInflationRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  return run(formData, InflationSchema, addInflation, false);
}
export async function deleteInflationRow(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const device = rowId(formData, "device_id");
  const child = rowId(formData, "child_id");
  return runSimple(formData, (db, id) => (device && child ? deleteInflation(db, id, device, child) : Promise.resolve(MISSING)));
}
export async function recordAsOutcome(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const event = rowId(formData, "child_id");
  const key = String(formData.get("outcome") ?? "") as OutcomeKey;
  const vascularRaw = String(formData.get("vascular") ?? "");
  const vascular = (ENUMS.vascular_complication as readonly string[]).includes(vascularRaw) ? (vascularRaw as Enums["vascular_complication"]) : null;
  if (!OUTCOME_KEYS.includes(key)) return { error: "Choose the outcome." };
  return runSimple(formData, (db, id) => (event ? recordEventAsOutcome(db, id, event, key, vascular) : Promise.resolve(MISSING)));
}

// §3.6
export async function saveIndicationSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  return run(formData, IndicationSheetSchema, updateIndication, true);
}
export async function saveOutcomeSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  return run(formData, OutcomeSheetSchema, saveOutcomes, true);
}
