import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Never surface or log the email; return only whether it worked.
  return { ok: !error };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
