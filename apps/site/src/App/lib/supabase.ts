import { createClient } from "@supabase/supabase-js";

const readEnv = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const projectId = readEnv(import.meta.env.VITE_SUPABASE_PROJECT_ID);
const publishableKey = readEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const explicitSupabaseUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const explicitAnonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const supabaseUrl =
  explicitSupabaseUrl || (projectId ? `https://${projectId}.supabase.co` : "");
const supabaseAnonKey = explicitAnonKey || publishableKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
