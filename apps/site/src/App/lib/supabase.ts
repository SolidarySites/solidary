import { createClient } from "@supabase/supabase-js";

declare const __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__: string;

const readEnv = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const projectId = readEnv(import.meta.env.VITE_SUPABASE_PROJECT_ID);
const publishableKey = readEnv(
  typeof __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__ === "string"
    ? __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__
    : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const explicitSupabaseUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseUrl =
  explicitSupabaseUrl || (projectId ? `https://${projectId}.supabase.co` : "");
const supabasePublishableKey = publishableKey;

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

const normalizeFunctionName = (value: string) =>
  value
    .trim()
    .replace(/^\/+/, "")
    .replace(/^functions\/v1\//, "")
    .replace(/^\.netlify\/functions\//, "")
    .replace(/^netlify\/functions\//, "")
    .replace(/^\/\.netlify\/functions\//, "");

export function supabaseFunctionUrl(functionName: string) {
  const normalizedName = normalizeFunctionName(functionName);
  if (!normalizedName) {
    throw new Error("Supabase function name is required.");
  }
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured.");
  }
  return `${supabaseUrl}/functions/v1/${normalizedName}`;
}
