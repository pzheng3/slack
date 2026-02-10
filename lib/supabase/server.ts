import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for server-side usage (Route Handlers, Server Components).
 * Uses the same anon key since we don't have Supabase Auth.
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, supabaseAnonKey);
}
