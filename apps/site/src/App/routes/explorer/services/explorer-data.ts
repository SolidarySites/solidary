import { supabase, supabaseFunctionUrl } from "../../../lib/supabase";

export type ExplorerNodeType = "site" | "index";
export type ExplorerEdgeType =
  | "site_connection"
  | "index_lineage"
  | "index_membership";

export type ExplorerNode = {
  id: string;
  nodeType: ExplorerNodeType;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  updatedAt: string | null;
  indexLevel: number | null;
  parentIndexId: string | null;
  parentIndexUrl: string | null;
  parentIndexLevel: number | null;
};

export type ExplorerSite = ExplorerNode;

export type ExplorerEdge = {
  id: string;
  edgeType: ExplorerEdgeType;
  sourceId: string;
  targetId: string;
  happenedAt: string | null;
};

export type ExplorerConnection = ExplorerEdge;

type ViewerSiteRow = {
  site_id: string | null;
};

type PublicExplorerGraphRow = {
  meta?: unknown;
  nodes?: unknown;
  edges?: unknown;
};

type PublicExplorerGraphNodeRow = {
  id?: unknown;
  node_type?: unknown;
  title?: unknown;
  description?: unknown;
  canonical_url?: unknown;
  image_url?: unknown;
  updated_at?: unknown;
  index_level?: unknown;
  parent_index_id?: unknown;
  parent_index_url?: unknown;
  parent_index_level?: unknown;
};

type PublicExplorerGraphEdgeRow = {
  id?: unknown;
  edge_type?: unknown;
  source_id?: unknown;
  target_id?: unknown;
  happened_at?: unknown;
};

export type ExplorerData = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
};

export const isExplorerRootIndexNode = (site: ExplorerSite) =>
  site.nodeType === "index" && (site.indexLevel === 0 || site.parentIndexId === site.id);

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
  if (!normalized) return null;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapGraphNodes = (rows: unknown): ExplorerSite[] =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const entry = (row ?? {}) as PublicExplorerGraphNodeRow;
      const id = toTrimmedString(entry.id);
      const canonicalUrl = toTrimmedString(entry.canonical_url);
      if (!id || !canonicalUrl) return null;

      const nodeType = toTrimmedString(entry.node_type) === "index"
        ? "index"
        : "site";

      return {
        id,
        nodeType,
        title: toTrimmedString(entry.title) ||
          (nodeType === "index" ? "Untitled index" : "Untitled site"),
        description: toTrimmedString(entry.description),
        canonicalUrl,
        imageUrl: toTrimmedString(entry.image_url),
        updatedAt: toNullableString(entry.updated_at),
        indexLevel: toNullableInt(entry.index_level),
        parentIndexId: toNullableString(entry.parent_index_id),
        parentIndexUrl: toNullableString(entry.parent_index_url),
        parentIndexLevel: toNullableInt(entry.parent_index_level),
      } satisfies ExplorerSite;
    })
    .filter((node): node is ExplorerSite => Boolean(node));

const mapGraphEdges = (rows: unknown): ExplorerConnection[] =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const entry = (row ?? {}) as PublicExplorerGraphEdgeRow;
      const id = toTrimmedString(entry.id);
      const sourceId = toTrimmedString(entry.source_id);
      const targetId = toTrimmedString(entry.target_id);
      if (!id || !sourceId || !targetId || sourceId === targetId) {
        return null;
      }

      const rawEdgeType = toTrimmedString(entry.edge_type);
      const edgeType: ExplorerEdgeType =
        rawEdgeType === "index_lineage" || rawEdgeType === "index_membership"
          ? rawEdgeType
          : "site_connection";

      return {
        id,
        edgeType,
        sourceId,
        targetId,
        happenedAt: toNullableString(entry.happened_at),
      } satisfies ExplorerConnection;
    })
    .filter((edge): edge is ExplorerConnection => Boolean(edge));

export const loadExplorerData = async (): Promise<ExplorerData> => {
  const response = await fetch(supabaseFunctionUrl("index-public-network"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : "Failed to load explorer data.";
    throw new Error(message);
  }

  const graphPayload = (payload ?? {}) as PublicExplorerGraphRow;
  const sites = mapGraphNodes(graphPayload.nodes);
  const siteIds = new Set(sites.map((site) => site.id));
  const connections = mapGraphEdges(graphPayload.edges).filter(
    (edge) => siteIds.has(edge.sourceId) && siteIds.has(edge.targetId),
  );

  return { sites, connections };
};

export const loadViewerSiteIdsForUser = async (userId: string): Promise<string[]> => {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return [];

  const { data, error } = await supabase
    .from("site_drafts")
    .select("site_id")
    .eq("owner_user_id", trimmedUserId)
    .eq("draft_type", "owner");

  if (error) {
    throw new Error(error.message);
  }

  const ids = new Set<string>();
  ((data ?? []) as ViewerSiteRow[]).forEach((row) => {
    const siteId = typeof row.site_id === "string" ? row.site_id.trim() : "";
    if (!siteId) return;
    ids.add(siteId);
  });
  return Array.from(ids);
};
