// Public values only. The service-role key is never read here — it is used
// only by scripts/seed.ts, which runs on a developer machine.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
