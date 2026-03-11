import { supabase } from "../../../lib/supabase";
import { loadPublicSites, type PublicSite } from "../../../services/public-sites";

export type ExplorerSite = PublicSite;

export type ExplorerConnection = {
  connectionUuid: string;
  sourceSiteId: string;
  targetSiteId: string;
  approvedAt: string | null;
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
  const [sites, connectionsResult] = await Promise.all([
    loadPublicSites(),
    supabase
      .from("site_connection_requests")
      .select("connection_uuid, source_site_id, target_site_id, responded_at")
      .eq("status", "approved")
      .order("responded_at", { ascending: false })
  ]);

  if (connectionsResult.error) {
    throw new Error(connectionsResult.error.message);
  }

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
