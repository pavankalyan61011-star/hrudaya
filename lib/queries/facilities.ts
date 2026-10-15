import type { DbClient } from "@/lib/supabase/types";

export async function listFacilities(db: DbClient) {
  const { data, error } = await db.from("facilities").select("id, name, cath_lab_name, city").order("name");
  return { facilities: data ?? [], error };
}
