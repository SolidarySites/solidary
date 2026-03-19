import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { runHandler } from "../_shared/request-adapter.ts";
import {
  refreshIndexFederationMirror,
} from "../_shared/index-federation.ts";
import type { Handler } from "../_shared/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";

type RefreshBody = {
  source_archive_id?: unknown;
  source_project_url?: unknown;
  source_publishable_key?: unknown;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const createServiceSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing SUPABASE_URL or Supabase service key.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const parseBody = (rawBody: string | null): RefreshBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as RefreshBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: RefreshBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
    });
  }

  const sourceArchiveId = toTrimmedString(body.source_archive_id);
  const sourceProjectUrl = toTrimmedString(body.source_project_url);
  const sourcePublishableKey = toTrimmedString(body.source_publishable_key);
  if (!sourceProjectUrl || !sourcePublishableKey) {
    return safeJson(400, {
      error: "Missing source_project_url or source_publishable_key.",
    });
  }

  try {
    const result = await refreshIndexFederationMirror({
      supabase: createServiceSupabase(),
      sourceProjectUrl,
      sourcePublishableKey,
      expectedArchiveId: sourceArchiveId || undefined,
    });

    return safeJson(200, {
      ok: true,
      archive_id: result.archiveId,
      membership_count: result.membershipCount,
      skipped: result.skipped,
      reason: result.reason,
    });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error
        ? error.message
        : "Failed to refresh federation mirror.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
