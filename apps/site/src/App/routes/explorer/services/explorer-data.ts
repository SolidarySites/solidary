import { supabase } from "../../../lib/supabase";

export type ExplorerSite = {
  id: string;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  updatedAt: string | null;
};

export type ExplorerConnection = {
  connectionUuid: string;
  sourceSiteId: string;
  targetSiteId: string;
  approvedAt: string | null;
};

type ExplorerSiteRow = {
  id: string | null;
  title: string | null;
  description: string | null;
  canonical_url: string | null;
  image_url: string | null;
  updated_at: string | null;
};

type ExplorerConnectionRow = {
  connection_uuid: string | null;
  source_site_id: string | null;
  target_site_id: string | null;
  responded_at: string | null;
};

type ViewerSiteRow = {
  site_id: string | null;
};

export type ExplorerData = {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
};

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

const resolveSiteImageUrl = (siteUrl: string, imageUrl: string) => {
  const normalizedSiteUrl = siteUrl.trim();
  const normalizedImageUrl = imageUrl.trim();

  if (!normalizedSiteUrl || !normalizedImageUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(normalizedImageUrl)) {
    return normalizedImageUrl;
  }

  try {
    const site = new URL(normalizedSiteUrl);
    const siteBasePath = trimSlashes(site.pathname);
    const normalizedPath = trimSlashes(normalizedImageUrl.replace(/^\.\//, ""));

    if (!normalizedPath) {
      return "";
    }

    if (siteBasePath && (normalizedPath === siteBasePath || normalizedPath.startsWith(`${siteBasePath}/`))) {
      return `${site.origin}/${normalizedPath}`;
    }

    if (siteBasePath) {
      return `${site.origin}/${siteBasePath}/${normalizedPath}`;
    }

    return `${site.origin}/${normalizedPath}`;
  } catch {
    return normalizedImageUrl;
  }
};

const mapSiteRows = (rows: ExplorerSiteRow[] | null | undefined): ExplorerSite[] =>
  (rows ?? [])
    .map((row) => {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) return null;
      const canonicalUrl = typeof row.canonical_url === "string" ? row.canonical_url.trim() : "";
      const imageUrl = typeof row.image_url === "string" ? row.image_url : "";
      return {
        id,
        title:
          typeof row.title === "string" && row.title.trim()
            ? row.title.trim()
            : "Untitled site",
        description: typeof row.description === "string" ? row.description : "",
        canonicalUrl,
        imageUrl: resolveSiteImageUrl(canonicalUrl, imageUrl),
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null
      } satisfies ExplorerSite;
    })
    .filter((entry): entry is ExplorerSite => Boolean(entry));

const mapConnectionRows = (rows: ExplorerConnectionRow[] | null | undefined): ExplorerConnection[] =>
  (rows ?? [])
    .map((row) => {
      const connectionUuid =
        typeof row.connection_uuid === "string" ? row.connection_uuid.trim() : "";
      const sourceSiteId =
        typeof row.source_site_id === "string" ? row.source_site_id.trim() : "";
      const targetSiteId =
        typeof row.target_site_id === "string" ? row.target_site_id.trim() : "";
      if (!connectionUuid || !sourceSiteId || !targetSiteId) return null;
      return {
        connectionUuid,
        sourceSiteId,
        targetSiteId,
        approvedAt: typeof row.responded_at === "string" ? row.responded_at : null
      } satisfies ExplorerConnection;
    })
    .filter((entry): entry is ExplorerConnection => Boolean(entry));

export const loadExplorerData = async (): Promise<ExplorerData> => {
  const [sitesResult, connectionsResult] = await Promise.all([
    supabase
      .from("sites")
      .select("id, title, description, canonical_url, image_url, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("site_connection_requests")
      .select("connection_uuid, source_site_id, target_site_id, responded_at")
      .eq("status", "approved")
      .order("responded_at", { ascending: false })
  ]);

  if (sitesResult.error) {
    throw new Error(sitesResult.error.message);
  }
  if (connectionsResult.error) {
    throw new Error(connectionsResult.error.message);
  }

  const sites = mapSiteRows((sitesResult.data ?? []) as ExplorerSiteRow[]);
  const sitesById = new Set(sites.map((site) => site.id));
  const connections = mapConnectionRows(
    (connectionsResult.data ?? []) as ExplorerConnectionRow[]
  ).filter(
    (connection) =>
      sitesById.has(connection.sourceSiteId) &&
      sitesById.has(connection.targetSiteId) &&
      connection.sourceSiteId !== connection.targetSiteId
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
