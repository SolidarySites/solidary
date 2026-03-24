import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  createServiceClientFromEnv,
  loadRecursivePublicNetwork,
} from "../_shared/index-public-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

type ReadBody = {
  depth?: number;
  remaining_depth?: number | null;
  visited_index_ids?: unknown;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): ReadBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as ReadBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const toVisitedIndexIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key.",
    });
  }

  try {
    const body = parseBody(event.body);
    const supabase = createServiceClientFromEnv({
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_KEY,
    });
    const payload = await loadRecursivePublicNetwork({
      supabase,
      requestedDepth: typeof body.depth === "number" ? body.depth : null,
      remainingDepth: typeof body.remaining_depth === "number" || body.remaining_depth === null
        ? body.remaining_depth
        : undefined,
      visitedIndexIds: toVisitedIndexIds(body.visited_index_ids),
    });

    return safeJson(200, payload);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not load the public network.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
