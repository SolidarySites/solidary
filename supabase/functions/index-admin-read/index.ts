import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  buildStandaloneAdminSetup,
  parseBearerToken,
  parseBridgeTokenFromEvent,
  readIndexAdminState,
  readLatestIndexFinalizationJob,
  resolveIndexAdminContext,
} from "../_shared/index-admin.ts";

type ReadBody = {
  archive_id?: string;
  bridge_token?: string;
  supabase_access_token?: string;
  supabase_personal_access_token?: string;
};

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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = parseBody(event.body);
    const archiveId = typeof body.archive_id === "string"
      ? body.archive_id.trim()
      : "";
    if (!archiveId) {
      return safeJson(400, { error: "Missing archive_id." });
    }

    const context = await resolveIndexAdminContext({
      archiveId,
      supabaseAccessToken: (typeof body.supabase_access_token === "string"
        ? body.supabase_access_token
        : "") ||
        parseBearerToken(
          event.headers.authorization ?? event.headers.Authorization,
        ),
      bridgeToken: parseBridgeTokenFromEvent(event, body),
    });
    const state = await readIndexAdminState(context);
    const latestJob = await readLatestIndexFinalizationJob({
      supabase: context.supabase,
      archiveId,
    });
    const setup = await buildStandaloneAdminSetup({
      context,
      state,
      latestJob,
      managementAccessTokenOverride:
        typeof body.supabase_personal_access_token === "string"
          ? body.supabase_personal_access_token
          : "",
    });

    return safeJson(200, {
      state,
      setup,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Could not load index admin.";
    const statusCode =
      /permission|access|missing Supabase session|expired/i.test(message)
        ? 403
        : 400;
    return safeJson(statusCode, { error: message });
  }
};

Deno.serve((request) => runHandler(request, handler));
