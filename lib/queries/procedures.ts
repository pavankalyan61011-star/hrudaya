import type { DbClient } from "@/lib/supabase/types";
import type { TablesUpdate } from "@/lib/database.types";

const CASE_CODE = /^(PCI|CAG)-(\d{4})-(\d{3,})$/;

/** Next case code for the year: one running number shared by PCI- and CAG- codes, as in the seed. */
export async function nextCaseCode(db: DbClient, year: string, prefix: "PCI" | "CAG" = "PCI") {
  const { data, error } = await db.from("procedures").select("case_code").like("case_code", `%-${year}-%`);
  if (error) return { code: null, error };
  let max = 0;
  for (const row of data ?? []) {
    const m = CASE_CODE.exec(row.case_code);
    if (m && m[2] === year) max = Math.max(max, Number(m[3]));
  }
  return { code: `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`, error: null };
}

/** Creates a draft procedure for the patient; retries if another device took the same case code. */
export async function createDraftProcedure(db: DbClient, patientId: string, year: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { code, error: codeError } = await nextCaseCode(db, year);
    if (codeError || !code) return { id: null, error: codeError };
    const { data, error } = await db
      .from("procedures")
      .insert({ patient_id: patientId, case_code: code, status: "draft" })
      .select("id")
      .single();
    if (!error) return { id: data.id, error: null };
    if (error.code !== "23505") return { id: null, error };
  }
  return { id: null, error: { code: "23505", message: "procedures_case_code_key" } };
}

/**
 * Updates a procedure only while the form may edit it: a draft, or a reviewed record with an open
 * amendment (Week 6). Completed and reviewed records are never changed by the form; the database
 * also refuses any status change while amending and the identity fields (case code, date, patient).
 */
export async function updateDraftProcedure(db: DbClient, id: string, fields: TablesUpdate<"procedures">) {
  const { data, error } = await db.from("procedures").update(fields).eq("id", id).in("status", ["draft", "amending"]).select("id");
  if (error) return { error };
  if (!data || data.length === 0) return { error: { code: "PGRST116", message: "draft not found" } };
  return { error: null };
}

export async function getDraftHeader(db: DbClient, id: string) {
  const { data, error } = await db
    .from("procedures")
    .select("id, case_code, status, procedure_type, procedure_date, patient:patients(id, full_name, mrn, sex, date_of_birth)")
    .eq("id", id)
    .maybeSingle();
  return { draft: data, error };
}

// procedures has four foreign keys to operators, so each embed names its key.
const FULL_SELECT = `
  *,
  patient:patients(*, risk_factors:patient_risk_factors(id, factor, detail)),
  operator:operators!procedures_primary_operator_id_fkey(id, full_name, role),
  reviewer:operators!procedures_reviewing_clinician_id_fkey(id, full_name, role),
  consent_by:operators!procedures_consent_by_operator_id_fkey(id, full_name),
  timeout_by:operators!procedures_timeout_by_operator_id_fkey(id, full_name),
  facility:facilities(id, name, cath_lab_name, city),
  vessel_findings!vessel_findings_procedure_id_fkey(*, lesion_physiology(*), intravascular_imaging(*)),
  interventions(*, devices_used(*, device_inflations(*))),
  procedure_medications(*),
  complications(*),
  discharge:discharges(*, discharge_medications(*)),
  grafts!grafts_procedure_id_fkey(*),
  haemodynamics(*),
  lv_wall_motion(*),
  in_hospital_outcomes(*),
  amendments:procedure_amendments(id, amendment_no, status, reason, opened_at, closed_at, changes, reviewer:operators!procedure_amendments_reviewing_clinician_id_fkey(id, full_name, role))
` as const;

/** The whole record, children in entry order. Used by the form steps and the detail page. */
export async function getProcedureFull(db: DbClient, id: string) {
  const { data, error } = await db
    .from("procedures")
    .select(FULL_SELECT)
    .eq("id", id)
    .order("created_at", { referencedTable: "vessel_findings" })
    .order("created_at", { referencedTable: "interventions" })
    .order("created_at", { referencedTable: "interventions.devices_used" })
    .order("created_at", { referencedTable: "complications" })
    .order("created_at", { referencedTable: "procedure_medications" })
    .order("created_at", { referencedTable: "discharges.discharge_medications" })
    .order("amendment_no", { referencedTable: "procedure_amendments" })
    .maybeSingle();
  return { procedure: data, error };
}

export type ProcedureFull = NonNullable<Awaited<ReturnType<typeof getProcedureFull>>["procedure"]>;

export async function listProcedures(db: DbClient) {
  const { data, error } = await db
    .from("procedures")
    .select("id, case_code, procedure_date, indication, procedure_type, status, created_at, patient:patients(full_name, mrn)")
    .order("procedure_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(200);
  return { procedures: data ?? [], error };
}

export async function completeProcedure(db: DbClient, id: string) {
  return updateDraftProcedure(db, id, { status: "completed" });
}

/**
 * Sign-off. Only a completed procedure moves to reviewed; the database stamps the signed-in user
 * and the time, and from then on the record is read-only.
 */
export async function markReviewed(db: DbClient, id: string, reviewingClinicianId: string) {
  const { data, error } = await db
    .from("procedures")
    .update({ status: "reviewed", reviewing_clinician_id: reviewingClinicianId })
    .eq("id", id)
    .eq("status", "completed")
    .select("id");
  if (error) return { error };
  if (!data || data.length === 0) return { error: { code: "PGRST116", message: "not completed" } };
  return { error: null };
}
