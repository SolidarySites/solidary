import { createClient } from "@supabase/supabase-js";

declare const __SOLIDARY_PROJECT_ID__: string;
declare const __SOLIDARY_SUPABASE_URL__: string;
declare const __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__: string;

const readEnv = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const projectId = readEnv(__SOLIDARY_PROJECT_ID__);
const publishableKey = readEnv(__SOLIDARY_SUPABASE_PUBLISHABLE_KEY__);
const explicitSupabaseUrl = readEnv(__SOLIDARY_SUPABASE_URL__);
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
