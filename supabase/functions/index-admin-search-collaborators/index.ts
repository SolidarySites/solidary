import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  parseBearerToken,
  parseBridgeTokenFromEvent,
  resolveIndexAdminContext,
  searchIndexCollaboratorCandidates,
} from "../_shared/index-admin.ts";

type SearchBody = {
  index_id?: string;
  query?: string;
  limit?: number;
  bridge_token?: string;
  supabase_access_token?: string;
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
    const indexId = typeof body.index_id === "string"
      ? body.index_id.trim()
      : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!indexId || !query) {
      return safeJson(400, { error: "Missing index_id or query." });
    }

    const context = await resolveIndexAdminContext({
      indexId,
      supabaseAccessToken: (typeof body.supabase_access_token === "string"
        ? body.supabase_access_token
        : "") ||
        parseBearerToken(
          event.headers.authorization ?? event.headers.Authorization,
        ),
      bridgeToken: parseBridgeTokenFromEvent(event, body),
    });
    const results = await searchIndexCollaboratorCandidates({
      context,
      query,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });

    return safeJson(200, { results });
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not search collaborators.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
