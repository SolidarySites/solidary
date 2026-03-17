import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { runHandler } from "../_shared/request-adapter.ts";
import { createIndexAdminBridgeToken } from "../_shared/index-admin-bridge.ts";
import type { Handler } from "../_shared/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") ?? "";
const LOCAL_ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): Record<string, unknown> => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const createServiceSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing SUPABASE_URL or Supabase service key.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const passwordsMatch = (expected: string, provided: string) => {
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, providedBytes);
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = parseBody(event.body);
    const archiveId = typeof body.archive_id === "string" ? body.archive_id.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (!archiveId) {
      return safeJson(400, {
        error: "Missing archive_id.",
        error_code: "archive_required",
      });
    }
    if (!ADMIN_PASSWORD.trim()) {
      return safeJson(503, {
        error: "Local admin password is not configured for this project yet.",
        error_code: "admin_password_unconfigured",
      });
    }
    if (!password) {
      return safeJson(400, {
        error: "Enter the admin password to continue.",
        error_code: "admin_password_required",
      });
    }
    if (!passwordsMatch(ADMIN_PASSWORD.trim(), password)) {
      return safeJson(403, {
        error: "Incorrect admin password.",
        error_code: "admin_password_invalid",
      });
    }

    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("archives")
      .select("id, owner_user_id")
      .eq("id", archiveId)
      .eq("type", "index")
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.id) {
      return safeJson(404, {
        error: "Index archive not found.",
        error_code: "archive_not_found",
      });
    }

    const ownerUserId = typeof data.owner_user_id === "string"
      ? data.owner_user_id.trim()
      : "";
    if (!ownerUserId) {
      return safeJson(412, {
        error: "This index is missing its owner account.",
        error_code: "owner_missing",
      });
    }

    const token = createIndexAdminBridgeToken({
      archiveId,
      userId: ownerUserId,
      role: "owner",
      expiresAt: new Date(Date.now() + LOCAL_ADMIN_TOKEN_TTL_MS).toISOString(),
    });

    return safeJson(200, {
      token,
    });
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not unlock local admin.",
      error_code: "admin_password_error",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
