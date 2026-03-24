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

type RequestsBody = {
  site_id?: string;
};

type SourceSiteRow = {
  id: string;
  parent_index_id: string | null;
};

type ConnectionRow = {
  id: string;
  requester_index_id: string | null;
  requester_index_url: string | null;
  requester_entity_id: string | null;
  requester_entity_url: string | null;
  requester_type: string | null;
  requested_index_id: string | null;
  requested_index_url: string | null;
  requested_entity_id: string | null;
  requested_entity_url: string | null;
  requested_type: string | null;
  status: string | null;
  created_at: string | null;
  responded_at: string | null;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): RequestsBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as RequestsBody;
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

const toNullableString = (value: unknown) => {
  const trimmed = toTrimmedString(value);
  return trimmed || null;
};

const normalizeStatus = (value: string | null | undefined) => {
  if (
    value === "approved" ||
    value === "rejected" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "pending";
};

const getFallbackTitle = ({
  nodeType,
  entityUrl,
  entityId,
}: {
  nodeType: "site" | "index";
  entityUrl: string | null;
  entityId: string | null;
}) => {
  const trimmedUrl = toTrimmedString(entityUrl);
  if (trimmedUrl) {
    try {
      const url = new URL(trimmedUrl);
      const candidate =
        url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() ||
        url.hostname;
      if (candidate) {
        return candidate;
      }
    } catch {
      return trimmedUrl;
    }
  }

  return entityId || (nodeType === "index" ? "Untitled index" : "Untitled site");
};

const createNodeLookup = (nodes: NetworkNode[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const byUrl = new Map(
    nodes
      .map((node) => [toTrimmedString(node.canonical_url), node] as const)
      .filter(([url]) => Boolean(url)),
  );
  return { byId, byUrl };
};

const resolveNode = ({
  nodeLookup,
  nodeType,
  indexId,
  indexUrl,
  entityId,
  entityUrl,
}: {
  nodeLookup: ReturnType<typeof createNodeLookup>;
  nodeType: "site" | "index";
  indexId: string | null;
  indexUrl: string | null;
  entityId: string | null;
  entityUrl: string | null;
}) => {
  const preferredId = nodeType === "index" ? indexId : entityId;
  const preferredUrl = nodeType === "index" ? indexUrl : entityUrl;
  return (
    (preferredId ? nodeLookup.byId.get(preferredId) : undefined) ||
    (preferredUrl ? nodeLookup.byUrl.get(preferredUrl) : undefined) ||
    null
  );
};

const compareRows = (left: ConnectionRow, right: ConnectionRow) => {
  if (left.status === "pending" && right.status !== "pending") return -1;
  if (left.status !== "pending" && right.status === "pending") return 1;

  const leftAt = Date.parse(left.responded_at ?? left.created_at ?? "");
  const rightAt = Date.parse(right.responded_at ?? right.created_at ?? "");
  if (Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt) {
    return rightAt - leftAt;
  }
  return toTrimmedString(right.created_at).localeCompare(
    toTrimmedString(left.created_at),
    undefined,
    { sensitivity: "base" },
  );
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
    const siteId = toTrimmedString(body.site_id);
    if (!siteId) {
      return safeJson(200, { requests: [] });
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
        p_site_id: siteId,
        p_user_id: authData.user.id,
      },
    );
    if (roleError) {
      throw new Error(roleError.message);
    }
    if (roleData !== "owner" && roleData !== "admin") {
      return safeJson(403, {
        error: "Only site owners/admins can load connection requests.",
      });
    }

    const { data: sourceSiteData, error: sourceSiteError } = await supabase
      .from("sites")
      .select("id, parent_index_id")
      .eq("id", siteId)
      .maybeSingle();
    if (sourceSiteError) {
      throw new Error(sourceSiteError.message);
    }
    const sourceSite = (sourceSiteData ?? null) as SourceSiteRow | null;
    if (!sourceSite?.id) {
      throw new Error("Source site not found.");
    }

    const [network, connectionRowsResult] = await Promise.all([
      loadRecursivePublicNetwork({
        supabase,
        requestedDepth: null,
      }),
      supabase
        .from("connections")
        .select(
          [
            "id",
            "requester_index_id",
            "requester_index_url",
            "requester_entity_id",
            "requester_entity_url",
            "requester_type",
            "requested_index_id",
            "requested_index_url",
            "requested_entity_id",
            "requested_entity_url",
            "requested_type",
            "status",
            "created_at",
            "responded_at",
          ].join(", "),
        )
        .or(`requester_entity_id.eq.${siteId},requested_entity_id.eq.${siteId}`),
    ]);

    if (connectionRowsResult.error) {
      throw new Error(connectionRowsResult.error.message);
    }

    const nodeLookup = createNodeLookup(network.nodes);
    const rows = ((connectionRowsResult.data ?? []) as unknown as ConnectionRow[]).sort(compareRows);
    const requests = rows.map((row) => {
      const requesterType = row.requester_type === "index" ? "index" : "site";
      const requestedType = row.requested_type === "index" ? "index" : "site";
      const requesterIndexId = toNullableString(row.requester_index_id);
      const requesterIndexUrl = toNullableString(row.requester_index_url);
      const requesterEntityId = toNullableString(row.requester_entity_id);
      const requesterEntityUrl = toNullableString(row.requester_entity_url);
      const requestedIndexId = toNullableString(row.requested_index_id);
      const requestedIndexUrl = toNullableString(row.requested_index_url);
      const requestedEntityId = toNullableString(row.requested_entity_id);
      const requestedEntityUrl = toNullableString(row.requested_entity_url);

      const requesterNode = resolveNode({
        nodeLookup,
        nodeType: requesterType,
        indexId: requesterIndexId,
        indexUrl: requesterIndexUrl,
        entityId: requesterEntityId,
        entityUrl: requesterEntityUrl,
      });
      const requestedNode = resolveNode({
        nodeLookup,
        nodeType: requestedType,
        indexId: requestedIndexId,
        indexUrl: requestedIndexUrl,
        entityId: requestedEntityId,
        entityUrl: requestedEntityUrl,
      });

      return {
        request_id: row.id,
        connection_id: row.id,
        status: normalizeStatus(row.status),
        created_at: row.created_at,
        responded_at: row.responded_at,
        source_site_id: requesterEntityId ?? requesterIndexId,
        source_site_title:
          requesterNode?.title ||
          getFallbackTitle({
            nodeType: requesterType,
            entityUrl: requesterEntityUrl ?? requesterIndexUrl,
            entityId: requesterEntityId ?? requesterIndexId,
          }),
        source_site_url:
          requesterNode?.canonical_url ||
          requesterEntityUrl ||
          requesterIndexUrl ||
          "",
        source_site_image_url: requesterNode?.image_url || "",
        source_owner_display_name: requesterNode?.owner_display_name || "Unknown",
        target_type: requestedType,
        target_site_id: requestedType === "site" ? requestedEntityId : null,
        target_index_id: requestedIndexId,
        target_title:
          requestedNode?.title ||
          getFallbackTitle({
            nodeType: requestedType,
            entityUrl: requestedType === "site" ? requestedEntityUrl : requestedIndexUrl,
            entityId: requestedType === "site" ? requestedEntityId : requestedIndexId,
          }),
        target_url:
          requestedNode?.canonical_url ||
          (requestedType === "site" ? requestedEntityUrl : requestedIndexUrl) ||
          "",
        target_image_url: requestedNode?.image_url || "",
        target_owner_display_name: requestedType === "index"
          ? (
            requestedNode?.title ||
            getFallbackTitle({
              nodeType: requestedType,
              entityUrl: requestedIndexUrl,
              entityId: requestedIndexId,
            })
          )
          : (requestedNode?.owner_display_name || "Unknown"),
        is_incoming:
          requestedType === "site" &&
          requestedEntityId === siteId,
      };
    });

    return safeJson(200, { requests });
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not load connection requests.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
