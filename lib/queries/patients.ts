import type { DbClient } from "@/lib/supabase/types";
import type { Enums } from "@/lib/labels";

export type PatientSearchResult = { id: string; mrn: string; full_name: string; sex: Enums["sex"]; date_of_birth: string };

/** Search by MRN or name. Characters that are syntax in a PostgREST filter are stripped first. */
export async function searchPatients(db: DbClient, query: string) {
  const term = query.replace(/[,()%*\\:"'.]/g, " ").trim();
  if (term.length < 2) return { patients: [] as PatientSearchResult[], error: null };
  const { data, error } = await db
    .from("patients")
    .select("id, mrn, full_name, sex, date_of_birth")
    .or(`mrn.ilike.%${term}%,full_name.ilike.%${term}%`)
    .order("full_name")
    .limit(10);
  return { patients: (data ?? []) as PatientSearchResult[], error };
}

export async function getPatientWithRiskFactors(db: DbClient, id: string) {
  const { data, error } = await db
    .from("patients")
    .select("id, mrn, full_name, sex, date_of_birth, mobile, risk_factors:patient_risk_factors(id, factor, detail)")
    .eq("id", id)
    .maybeSingle();
  return { patient: data, error };
}

export type NewPatient = { mrn: string; full_name: string; sex: Enums["sex"]; date_of_birth: string; mobile: string | null };

export async function createPatient(db: DbClient, input: NewPatient) {
  const { data, error } = await db
    .from("patients")
    .insert({ ...input, is_synthetic: true })
    .select("id")
    .single();
  return { id: data?.id ?? null, error };
}

export type RiskFactorInput = { factor: Enums["risk_factor"]; detail: string | null };

/** Makes the patient's risk factors exactly `wanted`: removes unticked, updates details, adds new. */
export async function syncRiskFactors(db: DbClient, patientId: string, wanted: RiskFactorInput[]) {
  const { data: existing, error: readError } = await db
    .from("patient_risk_factors")
    .select("id, factor, detail")
    .eq("patient_id", patientId);
  if (readError) return { error: readError };

  const wantedByFactor = new Map(wanted.map((w) => [w.factor, w]));
  const existingByFactor = new Map((existing ?? []).map((e) => [e.factor, e]));

  const toDelete = (existing ?? []).filter((e) => !wantedByFactor.has(e.factor)).map((e) => e.id);
  if (toDelete.length > 0) {
    const { error } = await db.from("patient_risk_factors").delete().in("id", toDelete);
    if (error) return { error };
  }

  for (const w of wanted) {
    const e = existingByFactor.get(w.factor);
    if (e && (e.detail ?? null) !== w.detail) {
      const { error } = await db.from("patient_risk_factors").update({ detail: w.detail }).eq("id", e.id);
      if (error) return { error };
    }
  }

  const toInsert = wanted.filter((w) => !existingByFactor.has(w.factor));
  if (toInsert.length > 0) {
    const { error } = await db
      .from("patient_risk_factors")
      .insert(toInsert.map((w) => ({ patient_id: patientId, factor: w.factor, detail: w.detail })));
    if (error) return { error };
  }
  return { error: null };
}
