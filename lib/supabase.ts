import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sign-in is handled by Supabase Auth; this is its browser client. The "publishable" key is public by design
 * (it only lets someone attempt to sign in); real access is decided by the API, which checks the token.
 *
 * Live mode needs all three settings. Without them the app runs exactly as before, on demo data only.
 * (Next.js inlines NEXT_PUBLIC_* values at build time, so each must be written out in full here.)
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export const liveConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY && API_URL);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!liveConfigured || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Live mode is not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_API_URL)");
  }
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
