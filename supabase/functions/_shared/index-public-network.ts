import { createClient } from "npm:@supabase/supabase-js@2.93.3";

type SupabaseClientLike = any;

const NETWORK_FUNCTION_NAME = "index-public-network";

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toNullableString = (value: unknown) => {
  const normalized = toTrimmedString(value);
  return normalized || null;
};

const toNullableInt = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const normalized = toTrimmedString(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

type RootIndexRow = {
  id: string;
  title: string | null;
  description: string | null;
  canonical_url: string | null;
  image_url: string | null;
  updated_at: string | null;
  index_level: number | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_index_level: number | null;
  default_connection_depth: number | null;
  max_connection_depth: number | null;
  owner_user_id: string | null;
};

type LocalSiteRow = {
  id: string;
  title: string | null;
  description: string | null;
  canonical_url: string | null;
  image_url: string | null;
  updated_at: string | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_index_level: number | null;
  visibility: string | null;
};

type IndexSiteRow = {
  site_id: string | null;
};

type OwnerDraftRow = {
  site_id: string | null;
  owner_user_id: string | null;
  repo_full_name: string | null;
};

type OwnerUserRow = {
  id: string;
  email: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

type ConnectionRow = {
  id: string;
  requester_index_id: string | null;
  requester_entity_id: string | null;
  requester_type: string | null;
  requested_index_id: string | null;
  requested_entity_id: string | null;
  requested_type: string | null;
  created_at: string | null;
  responded_at: string | null;
  status: string | null;
};

type FederationPeerRow = {
  remote_index_id: string | null;
  remote_project_url: string | null;
  remote_publishable_key: string | null;
  relationship: string | null;
  is_active: boolean | null;
};

type NetworkNodeType = "site" | "index";

export type NetworkNode = {
  id: string;
  node_type: NetworkNodeType;
  title: string;
  description: string;
  canonical_url: string;
  image_url: string;
  updated_at: string | null;
  index_level: number | null;
  parent_index_id: string | null;
  parent_index_url: string | null;
  parent_index_level: number | null;
  owner_user_id: string | null;
  owner_display_name: string;
  owner_email: string;
  owner_github_login: string | null;
};

export type NetworkEdge = {
  id: string;
  edge_type: "site_connection" | "index_lineage" | "index_membership";
  source_id: string;
  target_id: string;
  happened_at: string | null;
};

type NetworkPayload = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

type RecursiveFetchPayload = NetworkPayload & {
  meta: {
    local_index_id: string;
    default_connection_depth: number | null;
    max_connection_depth: number | null;
  };
};

type LocalSlice = {
  root: RootIndexRow;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  peers: {
    remoteIndexId: string;
    remoteProjectUrl: string;
    remotePublishableKey: string;
  }[];
};

const createOwnerDisplayName = ({
  email,
  userMetadata,
  fallback,
}: {
  email: string;
  userMetadata: Record<string, unknown> | null;
  fallback: string;
}) => {
  const candidate = [
    toTrimmedString(userMetadata?.name),
    toTrimmedString(userMetadata?.user_name),
    toTrimmedString(userMetadata?.preferred_username),
    email,
    fallback,
  ].find(Boolean);
  return candidate || fallback;
};

const createOwnerGithubLogin = (userMetadata: Record<string, unknown> | null) =>
  toNullableString(userMetadata?.user_name) ||
  toNullableString(userMetadata?.preferred_username);

const normalizeDepth = ({
  requestedDepth,
  defaultDepth,
  maxDepth,
}: {
  requestedDepth?: number | null;
  defaultDepth?: number | null;
  maxDepth?: number | null;
}) => {
  const normalizedRequested = typeof requestedDepth === "number"
    ? Math.trunc(requestedDepth)
    : defaultDepth ?? 0;
  const normalizedMax = typeof maxDepth === "number" ? Math.trunc(maxDepth) : null;

  let resolvedDepth: number | null =
    normalizedRequested <= 0 ? null : normalizedRequested;

  if (normalizedMax !== null && normalizedMax > 0) {
    resolvedDepth = resolvedDepth === null
      ? normalizedMax
      : Math.min(resolvedDepth, normalizedMax);
  }

  return resolvedDepth;
};

const mergeNode = (current: NetworkNode | undefined, next: NetworkNode) => {
  if (!current) {
    return next;
  }

  const currentUpdatedAt = current.updated_at ? Date.parse(current.updated_at) : Number.NEGATIVE_INFINITY;
  const nextUpdatedAt = next.updated_at ? Date.parse(next.updated_at) : Number.NEGATIVE_INFINITY;
  return nextUpdatedAt > currentUpdatedAt ? next : current;
};

const compareNodes = (left: NetworkNode, right: NetworkNode) => {
  const leftUpdatedAt = left.updated_at ? Date.parse(left.updated_at) : Number.NEGATIVE_INFINITY;
  const rightUpdatedAt = right.updated_at ? Date.parse(right.updated_at) : Number.NEGATIVE_INFINITY;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt > leftUpdatedAt ? 1 : -1;
  }
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
};

const compareEdges = (left: NetworkEdge, right: NetworkEdge) => {
  const leftTime = left.happened_at ? Date.parse(left.happened_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.happened_at ? Date.parse(right.happened_at) : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) {
    return rightTime > leftTime ? 1 : -1;
  }
  return left.id.localeCompare(right.id, undefined, { sensitivity: "base" });
};

const sanitizePayload = (payload: RecursiveFetchPayload): RecursiveFetchPayload => ({
  meta: {
    local_index_id: toTrimmedString(payload?.meta?.local_index_id),
    default_connection_depth: toNullableInt(payload?.meta?.default_connection_depth),
    max_connection_depth: toNullableInt(payload?.meta?.max_connection_depth),
  },
  nodes: (Array.isArray(payload?.nodes) ? payload.nodes : [])
    .map((node): NetworkNode => ({
      id: toTrimmedString(node?.id),
      node_type: (toTrimmedString(node?.node_type) === "index" ? "index" : "site") as NetworkNodeType,
      title: toTrimmedString(node?.title) || "Untitled",
      description: toTrimmedString(node?.description),
      canonical_url: toTrimmedString(node?.canonical_url),
      image_url: toTrimmedString(node?.image_url),
      updated_at: toNullableString(node?.updated_at),
      index_level: toNullableInt(node?.index_level),
      parent_index_id: toNullableString(node?.parent_index_id),
      parent_index_url: toNullableString(node?.parent_index_url),
      parent_index_level: toNullableInt(node?.parent_index_level),
      owner_user_id: toNullableString(node?.owner_user_id),
      owner_display_name: toTrimmedString(node?.owner_display_name) || "Unknown",
      owner_email: toTrimmedString(node?.owner_email),
      owner_github_login: toNullableString(node?.owner_github_login),
    }))
    .filter((node) => Boolean(node.id && node.canonical_url)),
  edges: (Array.isArray(payload?.edges) ? payload.edges : [])
    .map((edge): NetworkEdge => ({
      id: toTrimmedString(edge?.id),
      edge_type: (
        toTrimmedString(edge?.edge_type) === "index_lineage"
          ? "index_lineage"
          : toTrimmedString(edge?.edge_type) === "index_membership"
          ? "index_membership"
          : "site_connection"
      ) as NetworkEdge["edge_type"],
      source_id: toTrimmedString(edge?.source_id),
      target_id: toTrimmedString(edge?.target_id),
      happened_at: toNullableString(edge?.happened_at),
    }))
    .filter((edge) => Boolean(edge.id && edge.source_id && edge.target_id && edge.source_id !== edge.target_id)),
});

const createServiceClient = ({
  supabaseUrl,
  serviceKey,
}: {
  supabaseUrl: string;
  serviceKey: string;
}) =>
  createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const readRootIndex = async (supabase: SupabaseClientLike): Promise<RootIndexRow> => {
  const { data, error } = await supabase
    .from("indexes")
    .select(
      [
        "id",
        "title",
        "description",
        "canonical_url",
        "image_url",
        "updated_at",
        "index_level",
        "parent_index_id",
        "parent_index_url",
        "parent_index_level",
        "default_connection_depth",
        "max_connection_depth",
        "owner_user_id",
      ].join(", "),
    )
    .eq("type", "index")
    .eq("is_root", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("Root index is missing.");
  }

  return data as RootIndexRow;
};

const readLocalSites = async ({
  supabase,
  rootIndexId,
}: {
  supabase: SupabaseClientLike;
  rootIndexId: string;
}) => {
  const [
    { data: siteRows, error: sitesError },
    { data: trackedMembershipRows, error: membershipsError },
    { data: ownerDraftRows, error: ownerDraftsError },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select(
        [
          "id",
          "title",
          "description",
          "canonical_url",
          "image_url",
          "updated_at",
          "parent_index_id",
          "parent_index_url",
          "parent_index_level",
          "visibility",
        ].join(", "),
      )
      .eq("parent_index_id", rootIndexId),
    supabase
      .from("index_sites")
      .select("site_id")
      .eq("index_id", rootIndexId)
      .eq("status", "tracked"),
    supabase
      .from("site_drafts")
      .select("site_id, owner_user_id, repo_full_name")
      .eq("draft_type", "owner"),
  ]);

  if (sitesError) {
    throw new Error(sitesError.message);
  }

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  if (ownerDraftsError) {
    throw new Error(ownerDraftsError.message);
  }

  const trackedSiteIds = new Set(
    ((trackedMembershipRows ?? []) as IndexSiteRow[])
      .map((row) => toTrimmedString(row.site_id))
      .filter(Boolean),
  );
  const visibleSites = ((siteRows ?? []) as LocalSiteRow[])
    .filter((row) =>
      toTrimmedString(row.canonical_url) &&
      trackedSiteIds.has(row.id) &&
      (toTrimmedString(row.visibility) || "public") === "public"
    );
  const ownerDraftBySiteId = new Map(
    ((ownerDraftRows ?? []) as OwnerDraftRow[])
      .map((row) => [toTrimmedString(row.site_id), row] as const)
      .filter(([siteId]) => Boolean(siteId)),
  );
  const ownerUserIds = Array.from(
    new Set(
      Array.from(ownerDraftBySiteId.values())
        .map((row) => toTrimmedString(row.owner_user_id))
        .filter(Boolean),
    ),
  );

  let ownerById = new Map<string, OwnerUserRow>();
  if (ownerUserIds.length) {
    const { data: ownerRows, error: ownerError } = await supabase
      .schema("auth")
      .from("users")
      .select("id, email, raw_user_meta_data")
      .in("id", ownerUserIds);
    if (ownerError) {
      throw new Error(ownerError.message);
    }
    ownerById = new Map(
      ((ownerRows ?? []) as OwnerUserRow[]).map((row) => [row.id, row] as const),
    );
  }

  return visibleSites.map((row) => {
    const ownerDraft = ownerDraftBySiteId.get(row.id);
    const owner = ownerDraft
      ? ownerById.get(toTrimmedString(ownerDraft.owner_user_id))
      : undefined;
    const fallbackTitle = toTrimmedString(ownerDraft?.repo_full_name).split("/")[1] || row.id;

    return {
      id: row.id,
      node_type: "site" as const,
      title: toTrimmedString(row.title) || fallbackTitle || "Untitled site",
      description: toTrimmedString(row.description),
      canonical_url: toTrimmedString(row.canonical_url),
      image_url: toTrimmedString(row.image_url),
      updated_at: toNullableString(row.updated_at),
      index_level: null,
      parent_index_id: toNullableString(row.parent_index_id),
      parent_index_url: toNullableString(row.parent_index_url),
      parent_index_level: toNullableInt(row.parent_index_level),
      owner_user_id: toNullableString(ownerDraft?.owner_user_id),
      owner_display_name: createOwnerDisplayName({
        email: toTrimmedString(owner?.email),
        userMetadata: owner?.raw_user_meta_data ?? null,
        fallback: fallbackTitle || "Unknown",
      }),
      owner_email: toTrimmedString(owner?.email),
      owner_github_login: createOwnerGithubLogin(owner?.raw_user_meta_data ?? null),
    } satisfies NetworkNode;
  });
};

const readLocalConnections = async ({
  supabase,
  rootIndexId,
}: {
  supabase: SupabaseClientLike;
  rootIndexId: string;
}) => {
  const { data, error } = await supabase
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
        "created_at",
        "responded_at",
        "status",
      ].join(", "),
    )
    .eq("status", "approved")
    .or(`requester_index_id.eq.${rootIndexId},requested_index_id.eq.${rootIndexId}`);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ConnectionRow[]).reduce<NetworkEdge[]>((acc, row) => {
      const requesterIndexId = toTrimmedString(row.requester_index_id);
      const requesterEntityId = toTrimmedString(row.requester_entity_id);
      const requestedIndexId = toTrimmedString(row.requested_index_id);
      const requestedEntityId = toTrimmedString(row.requested_entity_id);
      const sourceId = row.requester_type === "index" ? requesterIndexId : requesterEntityId;
      const targetId = row.requested_type === "index" ? requestedIndexId : requestedEntityId;
      if (!sourceId || !targetId || sourceId === targetId) {
        return acc;
      }

      acc.push({
        id: toTrimmedString(row.id),
        edge_type: "site_connection" as const,
        source_id: sourceId,
        target_id: targetId,
        happened_at: toNullableString(row.responded_at) || toNullableString(row.created_at),
      });
      return acc;
    }, []);
};

const readActivePeers = async ({
  supabase,
  rootIndexId,
}: {
  supabase: SupabaseClientLike;
  rootIndexId: string;
}) => {
  const { data, error } = await supabase
    .from("index_federation_peers")
    .select("remote_index_id, remote_project_url, remote_publishable_key, relationship, is_active")
    .eq("local_index_id", rootIndexId)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as FederationPeerRow[])
    .map((row) => ({
      remoteIndexId: toTrimmedString(row.remote_index_id),
      remoteProjectUrl: toTrimmedString(row.remote_project_url),
      remotePublishableKey: toTrimmedString(row.remote_publishable_key),
    }))
    .filter((peer) =>
      Boolean(peer.remoteIndexId && peer.remoteProjectUrl && peer.remotePublishableKey)
    );
};

const readLocalSlice = async ({
  supabase,
}: {
  supabase: SupabaseClientLike;
}): Promise<LocalSlice> => {
  const root = await readRootIndex(supabase);
  const [sites, edges, peers] = await Promise.all([
    readLocalSites({ supabase, rootIndexId: root.id }),
    readLocalConnections({ supabase, rootIndexId: root.id }),
    readActivePeers({ supabase, rootIndexId: root.id }),
  ]);

  return {
    root,
    nodes: [
      {
        id: root.id,
        node_type: "index" as const,
        title: toTrimmedString(root.title) || "Untitled index",
        description: toTrimmedString(root.description),
        canonical_url: toTrimmedString(root.canonical_url),
        image_url: toTrimmedString(root.image_url),
        updated_at: toNullableString(root.updated_at),
        index_level: toNullableInt(root.index_level),
        parent_index_id: toNullableString(root.parent_index_id),
        parent_index_url: toNullableString(root.parent_index_url),
        parent_index_level: toNullableInt(root.parent_index_level),
        owner_user_id: toNullableString(root.owner_user_id),
        owner_display_name: "Unknown",
        owner_email: "",
        owner_github_login: null,
      },
      ...sites,
    ].filter((node) => Boolean(node.canonical_url)),
    edges,
    peers,
  };
};

const addDerivedEdges = (nodes: NetworkNode[], edges: NetworkEdge[]) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge] as const));

  nodes.forEach((node) => {
    if (node.node_type === "index") {
      const parentIndexId = toTrimmedString(node.parent_index_id);
      if (parentIndexId && parentIndexId !== node.id && nodeIds.has(parentIndexId)) {
        const edgeId = `index-lineage:${node.id}:${parentIndexId}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            edge_type: "index_lineage",
            source_id: parentIndexId,
            target_id: node.id,
            happened_at: node.updated_at,
          });
        }
      }
      return;
    }

    const parentIndexId = toTrimmedString(node.parent_index_id);
    if (parentIndexId && nodeIds.has(parentIndexId)) {
      const edgeId = `index-membership:${parentIndexId}:${node.id}`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          edge_type: "index_membership",
          source_id: parentIndexId,
          target_id: node.id,
          happened_at: node.updated_at,
        });
      }
    }
  });

  return Array.from(edgeMap.values()).filter((edge) =>
    nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)
  );
};

const fetchPeerPayload = async ({
  projectUrl,
  publishableKey,
  remainingDepth,
  visitedIndexIds,
}: {
  projectUrl: string;
  publishableKey: string;
  remainingDepth: number | null;
  visitedIndexIds: string[];
}) => {
  const url = `${projectUrl.replace(/\/+$/, "")}/functions/v1/${NETWORK_FUNCTION_NAME}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({
      remaining_depth: remainingDepth,
      visited_index_ids: visitedIndexIds,
    }),
  });

  if (!response.ok) {
    throw new Error(`Peer network read failed with status ${response.status}.`);
  }

  const payload = await response.json().catch(() => ({}));
  return sanitizePayload(payload as RecursiveFetchPayload);
};

export const loadRecursivePublicNetwork = async ({
  supabase,
  requestedDepth,
  remainingDepth,
  visitedIndexIds = [],
}: {
  supabase: SupabaseClientLike;
  requestedDepth?: number | null;
  remainingDepth?: number | null;
  visitedIndexIds?: string[];
}): Promise<RecursiveFetchPayload> => {
  const localSlice = await readLocalSlice({ supabase });
  const normalizedVisited = new Set(
    visitedIndexIds.map((value) => toTrimmedString(value)).filter(Boolean),
  );
  normalizedVisited.add(localSlice.root.id);

  const effectiveRemainingDepth = typeof remainingDepth === "number" || remainingDepth === null
    ? remainingDepth
    : normalizeDepth({
      requestedDepth,
      defaultDepth: localSlice.root.default_connection_depth,
      maxDepth: localSlice.root.max_connection_depth,
    });

  const nodeMap = new Map<string, NetworkNode>();
  localSlice.nodes.forEach((node) => {
    nodeMap.set(node.id, mergeNode(nodeMap.get(node.id), node));
  });

  const edgeMap = new Map<string, NetworkEdge>();
  localSlice.edges.forEach((edge) => edgeMap.set(edge.id, edge));

  if (effectiveRemainingDepth === null || effectiveRemainingDepth > 0) {
    const nextRemainingDepth = effectiveRemainingDepth === null
      ? null
      : effectiveRemainingDepth - 1;

    const peerPayloads = await Promise.all(
      localSlice.peers
        .filter((peer) => !normalizedVisited.has(peer.remoteIndexId))
        .map(async (peer) => {
          try {
            return await fetchPeerPayload({
              projectUrl: peer.remoteProjectUrl,
              publishableKey: peer.remotePublishableKey,
              remainingDepth: nextRemainingDepth,
              visitedIndexIds: Array.from(normalizedVisited),
            });
          } catch {
            return null;
          }
        }),
    );

    peerPayloads.forEach((payload) => {
      if (!payload) {
        return;
      }
      payload.nodes.forEach((node) => {
        nodeMap.set(node.id, mergeNode(nodeMap.get(node.id), node));
      });
      payload.edges.forEach((edge) => {
        edgeMap.set(edge.id, edge);
      });
    });
  }

  const nodes = Array.from(nodeMap.values()).sort(compareNodes);
  const edges = addDerivedEdges(nodes, Array.from(edgeMap.values())).sort(compareEdges);

  return {
    meta: {
      local_index_id: localSlice.root.id,
      default_connection_depth: toNullableInt(localSlice.root.default_connection_depth),
      max_connection_depth: toNullableInt(localSlice.root.max_connection_depth),
    },
    nodes,
    edges,
  };
};

export const createServiceClientFromEnv = ({
  supabaseUrl,
  serviceKey,
}: {
  supabaseUrl: string;
  serviceKey: string;
}) => createServiceClient({ supabaseUrl, serviceKey });
