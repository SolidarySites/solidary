import { createClient } from "@supabase/supabase-js";

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  (projectId ? `https://${projectId}.supabase.co` : "");
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? publishableKey ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function createSupabaseAccessTokenClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}
