import type { DbClient } from "@/lib/supabase/types";

export async function listOperators(db: DbClient) {
  const { data, error } = await db.from("operators").select("id, full_name, role").order("full_name");
  return { operators: data ?? [], error };
}
