import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  listAccessibleIndexesForUser,
  parseBearerToken,
} from "../_shared/index-admin.ts";

type ListBody = {
  supabase_access_token?: string;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): ListBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as ListBody;
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
    const supabaseAccessToken = body.supabase_access_token?.trim() ||
      parseBearerToken(
        event.headers.authorization ?? event.headers.Authorization,
      );
    if (!supabaseAccessToken) {
      return safeJson(401, { error: "Missing Supabase session token." });
    }

    const items = await listAccessibleIndexesForUser({
      supabaseAccessToken,
    });
    return safeJson(200, { items });
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not load index admin list.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
