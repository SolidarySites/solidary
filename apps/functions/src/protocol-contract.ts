import { createClient } from "@supabase/supabase-js";

type JsonStatus = 200 | 400 | 401 | 403 | 405 | 500;

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
export const CREATE_SITE_SUPABASE_API_KEY = process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
export const SOLIDARY_NODE_SYNC_SECRET = process.env.SOLIDARY_NODE_SYNC_SECRET ?? "";

export const safeJson = (statusCode: JsonStatus, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

export const ensureSupabaseEnv = () => {
  if (!SUPABASE_URL || !CREATE_SITE_SUPABASE_API_KEY) {
    return "Missing SUPABASE_URL or CREATE_SITE_SUPABASE_API_KEY.";
  }

  return null;
};

export const ensureNodeSyncSecretEnv = () => {
  if (!SOLIDARY_NODE_SYNC_SECRET) {
    return "Missing SOLIDARY_NODE_SYNC_SECRET.";
  }

  return null;
};

export const createSupabaseAdmin = () =>
  createClient(SUPABASE_URL, CREATE_SITE_SUPABASE_API_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

export const parseBody = <T>(rawBody: string | null): T => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as T;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

export const getBearerToken = (authorizationHeader: string | undefined): string => {
  const raw = authorizationHeader?.trim() ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return raw.slice(7).trim();
};

export const hasValidNodeSyncSecret = (providedSecret: string | undefined): boolean => {
  const expected = SOLIDARY_NODE_SYNC_SECRET.trim();
  const provided = providedSecret?.trim() ?? "";
  return Boolean(expected && provided && expected === provided);
};
