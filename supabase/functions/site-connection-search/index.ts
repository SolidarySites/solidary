import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  createServiceClientFromEnv,
  loadRecursivePublicNetwork,
  type NetworkNode,
} from "../_shared/index-public-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

type SearchBody = {
  source_site_id?: string;
  query?: string;
  mode?: string;
  limit?: number;
};

type SourceSiteRow = {
  id: string;
  canonical_url: string | null;
  parent_index_id: string | null;
};

type ConnectionRow = {
  id: string;
  requester_index_id: string | null;
  requester_entity_id: string | null;
  requester_type: string | null;
  requested_index_id: string | null;
  requested_entity_id: string | null;
  requested_type: string | null;
  status: string | null;
  created_at: string | null;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): SearchBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as SearchBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const buildEntityKey = ({
  type,
  indexId,
  entityId,
}: {
  type: "site" | "index";
  indexId: string;
  entityId?: string | null;
}) => `${type}:${indexId}:${type === "index" ? "" : (entityId ?? "")}`;

const matchQuery = ({
  node,
  query,
  mode,
}: {
  node: NetworkNode;
  query: string;
  mode: "site" | "user";
}) => {
  const normalizedQuery = query.toLowerCase();
  const haystack = mode === "user"
    ? [
      node.owner_display_name,
      node.owner_email,
      node.owner_github_login ?? "",
    ]
    : [
      node.title,
      node.description,
      node.canonical_url,
      node.owner_github_login ?? "",
      node.owner_email,
    ];
  return haystack.some((value) => value.toLowerCase().includes(normalizedQuery));
};

const resolveExistingState = ({
  sourceKey,
  targetKey,
  rows,
}: {
  sourceKey: string;
  targetKey: string;
  rows: ConnectionRow[];
}) => {
  for (const row of rows) {
    const requesterIndexId = toTrimmedString(row.requester_index_id);
    const requesterEntityId = toTrimmedString(row.requester_entity_id);
    const requestedIndexId = toTrimmedString(row.requested_index_id);
    const requestedEntityId = toTrimmedString(row.requested_entity_id);
    const requesterType = row.requester_type === "index" ? "index" : "site";
    const requestedType = row.requested_type === "index" ? "index" : "site";
    const requesterKey = buildEntityKey({
      type: requesterType,
      indexId: requesterIndexId,
      entityId: requesterEntityId || null,
    });
    const requestedKey = buildEntityKey({
      type: requestedType,
      indexId: requestedIndexId,
      entityId: requestedEntityId || null,
    });

    const matchesPair =
      (requesterKey === sourceKey && requestedKey === targetKey) ||
      (requesterKey === targetKey && requestedKey === sourceKey);
    if (!matchesPair) {
      continue;
    }

    if (row.status === "approved") {
      return {
        existing_state: "connected",
        existing_connection_id: row.id,
      };
    }

    if (row.status === "pending") {
      return {
        existing_state: requesterKey === sourceKey ? "pending_outgoing" : "pending_incoming",
        existing_connection_id: row.id,
      };
    }
  }

  return {
    existing_state: "available",
    existing_connection_id: null,
  };
};

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
    const sourceSiteId = toTrimmedString(body.source_site_id);
    const query = toTrimmedString(body.query);
    const mode = toTrimmedString(body.mode) === "user" ? "user" : "site";
    const limit = Math.max(1, Math.min(30, typeof body.limit === "number" ? Math.trunc(body.limit) : 20));
    if (!sourceSiteId || !query) {
      return safeJson(200, { results: [] });
    }

    const accessToken = parseBearerToken(
      event.headers.authorization ?? event.headers.Authorization,
    );
    if (!accessToken) {
      return safeJson(401, { error: "Missing bearer token." });
    }

    const supabase = createServiceClientFromEnv({
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_KEY,
    });
    const sessionClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await sessionClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return safeJson(401, { error: "Invalid Supabase session." });
    }

    const { data: roleData, error: roleError } = await supabase.rpc(
      "site_user_role_for_site",
      {
        p_site_id: sourceSiteId,
        p_user_id: authData.user.id,
      },
    );
    if (roleError) {
      throw new Error(roleError.message);
    }
    if (roleData !== "owner" && roleData !== "admin") {
      return safeJson(403, {
        error: "Only site owners/admins can search connection targets.",
      });
    }

    const { data: sourceSiteData, error: sourceSiteError } = await supabase
      .from("sites")
      .select("id, canonical_url, parent_index_id")
      .eq("id", sourceSiteId)
      .maybeSingle();
    if (sourceSiteError) {
      throw new Error(sourceSiteError.message);
    }
    const sourceSite = (sourceSiteData ?? null) as SourceSiteRow | null;
    const sourceIndexId = toTrimmedString(sourceSite?.parent_index_id);
    if (!sourceSite || !sourceIndexId) {
      throw new Error("Source site is missing its parent index.");
    }

    const network = await loadRecursivePublicNetwork({
      supabase,
      requestedDepth: null,
    });
    const { data: connectionRows, error: connectionsError } = await supabase
      .from("connections")
      .select(
        [
          "id",
          "requester_index_id",
          "requester_entity_id",
          "requester_type",
          "requested_index_id",
          "requested_entity_id",
          "requested_type",
          "status",
          "created_at",
        ].join(", "),
      )
      .or(`requester_entity_id.eq.${sourceSiteId},requested_entity_id.eq.${sourceSiteId}`)
      .in("status", ["pending", "approved"]);
    if (connectionsError) {
      throw new Error(connectionsError.message);
    }

    const sourceKey = buildEntityKey({
      type: "site",
      indexId: sourceIndexId,
      entityId: sourceSiteId,
    });
    const results = network.nodes
      .filter((node) => node.id !== sourceSiteId)
      .filter((node) => matchQuery({ node, query, mode }))
      .map((node) => {
        const targetType = node.node_type;
        const targetKey = buildEntityKey({
          type: targetType,
          indexId: targetType === "index"
            ? node.id
            : (toTrimmedString(node.parent_index_id) || node.id),
          entityId: targetType === "site" ? node.id : null,
        });
        const existingState = resolveExistingState({
          sourceKey,
          targetKey,
          rows: ((connectionRows ?? []) as unknown) as ConnectionRow[],
        });

        return {
          target_type: targetType,
          target_site_id: targetType === "site" ? node.id : null,
          target_index_id: targetType === "index" ? node.id : null,
          target_title: node.title,
          target_description: node.description,
          target_url: node.canonical_url,
          target_image_url: node.image_url,
          target_owner_user_id: node.owner_user_id,
          target_owner_display_name: node.owner_display_name,
          target_owner_email: node.owner_email,
          target_owner_github_login: node.owner_github_login,
          existing_state: existingState.existing_state,
          existing_connection_id: existingState.existing_connection_id,
          existing_request_id: existingState.existing_connection_id,
        };
      })
      .slice(0, limit);

    return safeJson(200, { results });
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not search connection targets.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
