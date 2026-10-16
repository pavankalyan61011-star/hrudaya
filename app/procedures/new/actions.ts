"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/dates";
import { friendlyError } from "@/lib/queries/errors";
import {
  createPatient,
  getPatientWithRiskFactors,
  searchPatients,
  syncRiskFactors,
  type PatientSearchResult,
} from "@/lib/queries/patients";
import { createDraftProcedure, getDraftHeader, updateDraftProcedure, completeProcedure, markReviewed } from "@/lib/queries/procedures";
import { saveComplications, saveDischarge, saveInterventions, saveProcedureMedications, saveVessels } from "@/lib/queries/capture";
import {
  AngiographyStepSchema,
  DetailsStepSchema,
  DischargeStepSchema,
  IndicationStepSchema,
  InterventionStepSchema,
  PatientStepSchema,
  fieldErrors,
} from "@/lib/validation/capture";
import type { StepState } from "@/components/form/form-status";
import { getCurrentUser } from "@/lib/queries/auth";

// Nothing in this file logs. Errors returned to the form carry no row data (see friendlyError).

const CHECK_FIELDS = "Please fix the highlighted fields.";
const SIGNED_OUT = "Your session has ended. Sign in again — this step was not saved.";

function readPayload(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("payload") ?? "null"));
  } catch {
    return null;
  }
}

function stepUrl(id: string, step: number) {
  return `/procedures/new?id=${id}&step=${step}`;
}

/** The procedure must exist and be editable: a draft, or a reviewed record with an open amendment. */
async function requireDraft(formData: FormData) {
  const db = createClient();
  const id = String(formData.get("procedure_id") ?? "");
  const { draft, error } = await getDraftHeader(db, id);
  if (error || !draft) return { db, draft: null, amending: false, error: "This draft could not be found." };
  const status = draft.status as string;
  if (status !== "draft" && status !== "amending") {
    return { db, draft: null, amending: false, error: "This procedure is already completed. To correct a reviewed record, open an amendment from its report." };
  }
  return { db, draft, amending: status === "amending", error: null };
}

const PATIENT_LOCKED = "Patient details cannot be changed during an amendment. Correcting a patient's identity needs a different process.";

export async function searchPatientsAction(query: string): Promise<PatientSearchResult[]> {
  if (!(await getCurrentUser())) return [];
  const db = createClient();
  const { patients } = await searchPatients(db, query);
  return patients;
}

export async function getPatientRiskFactorsAction(patientId: string) {
  if (!(await getCurrentUser())) return [];
  const db = createClient();
  const { patient } = await getPatientWithRiskFactors(db, patientId);
  return (patient?.risk_factors ?? []).map((r) => ({ factor: r.factor, detail: r.detail }));
}

// ─── Step 1 ────────────────────────────────────────────────────────────────────

export async function savePatientStep(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = PatientStepSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const db = createClient();

  // Week 6: during an amendment the patient (and their risk factors) are locked; refuse before
  // anything is written. The database refuses too.
  if (String(formData.get("procedure_id") ?? "")) {
    const check = await requireDraft(formData);
    if (check.amending) return { error: PATIENT_LOCKED };
  }

  let patientId: string;
  if (input.mode === "new" && input.new_patient) {
    const { id, error } = await createPatient(db, input.new_patient);
    if (error || !id) return { error: friendlyError(error) };
    patientId = id;
  } else {
    patientId = input.patient_id as string;
  }

  const rf = await syncRiskFactors(db, patientId, input.risk_factors);
  if (rf.error) return { error: friendlyError(rf.error) };

  const existingId = String(formData.get("procedure_id") ?? "");
  let procedureId: string;
  if (existingId) {
    const { draft, error } = await requireDraft(formData);
    if (error || !draft) return { error: error ?? "This draft could not be found." };
    const upd = await updateDraftProcedure(db, draft.id, { patient_id: patientId });
    if (upd.error) return { error: friendlyError(upd.error) };
    procedureId = draft.id;
  } else {
    const { id, error } = await createDraftProcedure(db, patientId, todayIST().slice(0, 4));
    if (error || !id) return { error: friendlyError(error) };
    procedureId = id;
  }
  redirect(stepUrl(procedureId, 2));
}

// ─── Step 2 ────────────────────────────────────────────────────────────────────

export async function saveIndicationStep(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = IndicationStepSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, draft, amending, error } = await requireDraft(formData);
  if (error || !draft) return { error: error ?? undefined };

  const { troponin, access_ultrasound, ...rest } = parsed.data;
  // Week 6: case code and procedure date cannot be amended; the form shows them read-only and they
  // are not sent to the database while amending.
  const { case_code, procedure_date, ...amendable } = rest;
  const fields = amending ? amendable : { ...amendable, case_code, procedure_date };
  const upd = await updateDraftProcedure(db, draft.id, { ...fields, troponin_elevated: troponin, access_ultrasound_guided: access_ultrasound });
  if (upd.error) return { error: friendlyError(upd.error) };
  redirect(stepUrl(draft.id, 3));
}

// ─── Step 3 ────────────────────────────────────────────────────────────────────

export async function saveAngiographyStep(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = AngiographyStepSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, draft, error } = await requireDraft(formData);
  if (error || !draft) return { error: error ?? undefined };

  const { vessels, ...procedureFields } = parsed.data;
  const upd = await updateDraftProcedure(db, draft.id, procedureFields);
  if (upd.error) return { error: friendlyError(upd.error) };
  const res = await saveVessels(db, draft.id, vessels);
  if (res.error) return { error: friendlyError(res.error) };
  redirect(stepUrl(draft.id, 4));
}

// ─── Step 4 ────────────────────────────────────────────────────────────────────

export async function saveInterventionStep(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = InterventionStepSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, draft, error } = await requireDraft(formData);
  if (error || !draft) return { error: error ?? undefined };

  const diagnosticOnly = draft.procedure_type === "diagnostic_angiography";
  // A diagnostic-only procedure has no interventions: saving this step clears any left from before.
  const interventions = diagnosticOnly ? [] : parsed.data.interventions;
  if (!diagnosticOnly && interventions.length === 0) {
    return { error: "Add the treated lesion, or change the procedure type to diagnostic angiography in step 2." };
  }

  const res = await saveInterventions(db, draft.id, interventions);
  if (res.error) return { error: friendlyError(res.error) };
  redirect(stepUrl(draft.id, 5));
}

// ─── Step 5 ────────────────────────────────────────────────────────────────────

export async function saveDetailsStep(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = DetailsStepSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, draft, error } = await requireDraft(formData);
  if (error || !draft) return { error: error ?? undefined };

  const { complications, procedure_medications, ...fields } = parsed.data;
  const upd = await updateDraftProcedure(db, draft.id, fields);
  if (upd.error) return { error: friendlyError(upd.error) };
  const meds = await saveProcedureMedications(db, draft.id, procedure_medications);
  if (meds.error) return { error: friendlyError(meds.error) };
  const res = await saveComplications(db, draft.id, complications);
  if (res.error) return { error: friendlyError(res.error) };
  redirect(stepUrl(draft.id, 6));
}

// ─── Step 6 ────────────────────────────────────────────────────────────────────

export async function saveDischargeStep(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const parsed = DischargeStepSchema.safeParse(readPayload(formData));
  if (!parsed.success) return { error: CHECK_FIELDS, fieldErrors: fieldErrors(parsed.error) };
  const { db, draft, amending, error } = await requireDraft(formData);
  if (error || !draft) return { error: error ?? undefined };

  const res = await saveDischarge(db, draft.id, parsed.data.admitted ? null : parsed.data.discharge);
  if (res.error) return { error: friendlyError(res.error) };

  // Week 6: an amendment is not "completed" — it goes to the page that shows the changes being
  // signed and closes the amendment with the second signature.
  if (amending) redirect(`/procedures/${draft.id}/amendment`);

  // The database refuses completion if an earlier step is incomplete; that message is shown here.
  const done = await completeProcedure(db, draft.id);
  if (done.error) return { error: friendlyError(done.error) };
  redirect(`/procedures/${draft.id}`);
}

// ─── Sign-off (report page) ────────────────────────────────────────────────────

export async function markReviewedAction(_prev: StepState, formData: FormData): Promise<StepState> {
  if (!(await getCurrentUser())) return { error: SIGNED_OUT };
  const procedureId = String(formData.get("procedure_id") ?? "");
  const clinicianId = String(formData.get("reviewing_clinician_id") ?? "");
  if (!clinicianId) return { error: "Choose the reviewing clinician.", fieldErrors: { reviewing_clinician_id: "Required" } };
  const db = createClient();
  const { error } = await markReviewed(db, procedureId, clinicianId);
  if (error) return { error: friendlyError(error) };
  redirect(`/procedures/${procedureId}`);
}
