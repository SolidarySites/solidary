import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  createServiceClientFromEnv,
  loadRecursivePublicNetwork,
  type NetworkNode,
} from "../_shared/index-public-network.ts";
import { syncLocalConnectionSiteLinksIfPresent } from "../_shared/connection-site-links.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

type WriteBody = {
  action?: string;
  source_site_id?: string;
  target_site_id?: string | null;
  target_index_id?: string | null;
  request_id?: string;
};

type SourceSiteRow = {
  id: string;
  canonical_url: string | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
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

const parseBody = (rawBody: string | null): WriteBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as WriteBody;
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

const buildEntityKey = ({
  type,
  indexId,
  entityId,
}: {
  type: "site" | "index";
  indexId: string;
  entityId?: string | null;
}) => `${type}:${indexId}:${type === "index" ? "" : (entityId ?? "")}`;

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

const resolveExistingRow = ({
  rows,
  sourceKey,
  targetKey,
}: {
  rows: ConnectionRow[];
  sourceKey: string;
  targetKey: string;
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
    return row;
  }
  return null;
};

const createNodeLookup = (nodes: NetworkNode[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  return { byId };
};

const resolveTargetNode = ({
  nodeLookup,
  targetSiteId,
  targetIndexId,
}: {
  nodeLookup: ReturnType<typeof createNodeLookup>;
  targetSiteId: string;
  targetIndexId: string;
}) => {
  if (targetIndexId) {
    const node = nodeLookup.byId.get(targetIndexId);
    if (!node || node.node_type !== "index") {
      throw new Error("Target index is not reachable from this site.");
    }
    return node;
  }

  const node = nodeLookup.byId.get(targetSiteId);
  if (!node || node.node_type !== "site") {
    throw new Error("Target site is not reachable from this site.");
  }
  return node;
};

const createMutationPayload = ({
  requestId,
  status,
}: {
  requestId: string;
  status: string | null;
}) => ({
  request_id: requestId,
  connection_id: requestId,
  status: normalizeStatus(status),
});

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
    const action = toTrimmedString(body.action);
    const siteId = toTrimmedString(body.source_site_id);
    if (!siteId) {
      throw new Error("Missing source site id.");
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
        error: "Only site owners/admins can update connection requests.",
      });
    }

    const { data: sourceSiteData, error: sourceSiteError } = await supabase
      .from("sites")
      .select("id, canonical_url, parent_index_id, parent_index_url")
      .eq("id", siteId)
      .maybeSingle();
    if (sourceSiteError) {
      throw new Error(sourceSiteError.message);
    }
    const sourceSite = (sourceSiteData ?? null) as SourceSiteRow | null;
    const sourceIndexId = toTrimmedString(sourceSite?.parent_index_id);
    if (!sourceSite?.id || !sourceIndexId) {
      throw new Error("Source site is missing its parent index.");
    }

    if (action === "send_invite") {
      const [network, existingRowsResult] = await Promise.all([
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
          .or(`requester_entity_id.eq.${siteId},requested_entity_id.eq.${siteId}`)
          .in("status", ["pending", "approved"]),
      ]);
      if (existingRowsResult.error) {
        throw new Error(existingRowsResult.error.message);
      }

      const targetSiteId = toTrimmedString(body.target_site_id);
      const targetIndexId = toTrimmedString(body.target_index_id);
      if (!targetSiteId && !targetIndexId) {
        throw new Error("Missing connection target.");
      }
      if (targetSiteId && targetIndexId) {
        throw new Error("Choose either a site target or an index target.");
      }
      if (targetSiteId === siteId) {
        throw new Error("A site cannot connect to itself.");
      }

      const targetNode = resolveTargetNode({
        nodeLookup: createNodeLookup(network.nodes),
        targetSiteId,
        targetIndexId,
      });
      const targetType = targetNode.node_type;
      const resolvedTargetIndexId = targetType === "index"
        ? targetNode.id
        : toTrimmedString(targetNode.parent_index_id);
      if (!resolvedTargetIndexId) {
        throw new Error("Target site is missing its parent index.");
      }

      const sourceKey = buildEntityKey({
        type: "site",
        indexId: sourceIndexId,
        entityId: siteId,
      });
      const targetKey = buildEntityKey({
        type: targetType,
        indexId: resolvedTargetIndexId,
        entityId: targetType === "site" ? targetNode.id : null,
      });
      const existingRow = resolveExistingRow({
        rows: (existingRowsResult.data ?? []) as unknown as ConnectionRow[],
        sourceKey,
        targetKey,
      });
      if (existingRow) {
        return safeJson(200, createMutationPayload({
          requestId: existingRow.id,
          status: existingRow.status,
        }));
      }

      const autoApprove = targetType === "index" && resolvedTargetIndexId === sourceIndexId;
      const connectionId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const { error: insertError } = await supabase.from("connections").insert({
        id: connectionId,
        source_requested_by_user_id: authData.user.id,
        status: autoApprove ? "approved" : "pending",
        responded_at: autoApprove ? nowIso : null,
        responded_by_user_id: autoApprove ? authData.user.id : null,
        requester_index_id: sourceIndexId,
        requester_index_url: sourceSite.parent_index_url ?? "",
        requester_entity_id: sourceSite.id,
        requester_entity_url: sourceSite.canonical_url ?? "",
        requester_type: "site",
        requested_index_id: resolvedTargetIndexId,
        requested_index_url:
          targetType === "index"
            ? targetNode.canonical_url
            : (targetNode.parent_index_url ?? ""),
        requested_entity_id: targetType === "site" ? targetNode.id : null,
        requested_entity_url:
          targetType === "site"
            ? targetNode.canonical_url
            : null,
        requested_type: targetType,
      });
      if (insertError) {
        throw new Error(insertError.message);
      }

      if (autoApprove) {
        const { error: membershipError } = await supabase.from("index_sites").upsert({
          index_id: sourceIndexId,
          site_id: siteId,
          status: "tracked",
          delist_reason_code: null,
          delist_note: null,
        });
        if (membershipError) {
          throw new Error(membershipError.message);
        }

        await syncLocalConnectionSiteLinksIfPresent({
          supabase,
          siteId,
        });
      }

      return safeJson(200, createMutationPayload({
        requestId: connectionId,
        status: autoApprove ? "approved" : "pending",
      }));
    }

    const requestId = toTrimmedString(body.request_id);
    if (!requestId) {
      throw new Error("Missing request id.");
    }

    const { data: requestRowData, error: requestRowError } = await supabase
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
        ].join(", "),
      )
      .eq("id", requestId)
      .maybeSingle();
    if (requestRowError) {
      throw new Error(requestRowError.message);
    }
    const requestRow = (requestRowData ?? null) as ConnectionRow | null;
    if (!requestRow?.id) {
      throw new Error("Connection request not found.");
    }

    const requesterEntityId = toTrimmedString(requestRow.requester_entity_id);
    const requestedEntityId = toTrimmedString(requestRow.requested_entity_id);
    const requestedIndexId = toTrimmedString(requestRow.requested_index_id);
    const requestedType = requestRow.requested_type === "index" ? "index" : "site";

    if (action === "respond") {
      const requestedAction = toTrimmedString((body as { response_action?: string }).response_action);
      const approvedAction = requestedAction === "reject" ? "rejected" : "approved";
      if (requestedType !== "site" || requestedEntityId !== siteId) {
        throw new Error("Only incoming site requests can be answered here.");
      }
      if (requestRow.status !== "pending") {
        return safeJson(200, createMutationPayload({
          requestId: requestRow.id,
          status: requestRow.status,
        }));
      }

      const { error: updateError } = await supabase
        .from("connections")
        .update({
          status: approvedAction,
          responded_at: new Date().toISOString(),
          responded_by_user_id: authData.user.id,
        })
        .eq("id", requestRow.id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      if (approvedAction === "approved") {
        await syncLocalConnectionSiteLinksIfPresent({
          supabase,
          siteId: toTrimmedString(requestRow.requester_entity_id),
        });
        await syncLocalConnectionSiteLinksIfPresent({
          supabase,
          siteId,
        });
      }

      return safeJson(200, createMutationPayload({
        requestId: requestRow.id,
        status: approvedAction,
      }));
    }

    if (action !== "disconnect") {
      throw new Error("Unsupported connection action.");
    }

    if (requesterEntityId !== siteId && requestedEntityId !== siteId) {
      throw new Error("This site is not part of the selected connection.");
    }
    if (requestRow.status !== "pending" && requestRow.status !== "approved") {
      return safeJson(200, createMutationPayload({
        requestId: requestRow.id,
        status: requestRow.status,
      }));
    }

    const { error: cancelError } = await supabase
      .from("connections")
      .update({
        status: "cancelled",
        responded_at: new Date().toISOString(),
        responded_by_user_id: authData.user.id,
      })
      .eq("id", requestRow.id);
    if (cancelError) {
      throw new Error(cancelError.message);
    }

    const disconnectsLocalIndex =
      requestRow.requester_type !== "index" &&
      requesterEntityId === siteId &&
      requestedType === "index" &&
      requestedIndexId === sourceIndexId;
    if (disconnectsLocalIndex) {
      const { error: delistError } = await supabase
        .from("index_sites")
        .update({
          status: "delisted",
          delist_reason_code: "connection_removed",
          delist_note: null,
        })
        .eq("index_id", sourceIndexId)
        .eq("site_id", siteId);
      if (delistError) {
        throw new Error(delistError.message);
      }
    }

    if (requestRow.requester_type !== "index" && requesterEntityId) {
      await syncLocalConnectionSiteLinksIfPresent({
        supabase,
        siteId: requesterEntityId,
      });
    }

    if (requestedType === "site" && requestedEntityId) {
      await syncLocalConnectionSiteLinksIfPresent({
        supabase,
        siteId: requestedEntityId,
      });
    }

    return safeJson(200, createMutationPayload({
      requestId: requestRow.id,
      status: "cancelled",
    }));
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not update the connection request.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
