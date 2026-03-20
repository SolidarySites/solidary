import { resolveSiteThumbnailUrl } from "../lib/site-image-url";
import { buildConnectedSiteLookup } from "../routes/explorer/services/explorer-graph";
import {
  isExplorerRootIndexNode,
  loadExplorerData,
  type ExplorerSite,
} from "../routes/explorer/services/explorer-data";

export type PublicNetworkNode = ExplorerSite & {
  connectionCount: number;
};

const getUpdatedAtTimestamp = (value: string | null) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const comparePublicNetworkNodes = (
  left: PublicNetworkNode,
  right: PublicNetworkNode,
) => {
  const leftUpdatedAt = getUpdatedAtTimestamp(left.updatedAt);
  const rightUpdatedAt = getUpdatedAtTimestamp(right.updatedAt);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt > leftUpdatedAt ? 1 : -1;
  }

  const leftConnections = left.connectionCount;
  const rightConnections = right.connectionCount;
  if (leftConnections !== rightConnections) {
    return rightConnections - leftConnections;
  }

  return left.title.localeCompare(right.title, undefined, {
    sensitivity: "base",
  });
};

const withResolvedImage = (node: ExplorerSite): ExplorerSite => ({
  ...node,
  imageUrl: resolveSiteThumbnailUrl({
    siteUrl: node.canonicalUrl,
    fallbackImageUrl: node.imageUrl,
  }),
});

export const loadPublicNetwork = async (): Promise<PublicNetworkNode[]> => {
  const { sites, connections } = await loadExplorerData();
  const visibleSites = sites
    .filter((site) => !isExplorerRootIndexNode(site))
    .map(withResolvedImage);
  const connectedBySiteId = buildConnectedSiteLookup(connections);

  return visibleSites
    .map((site) => ({
      ...site,
      connectionCount: connectedBySiteId[site.id]?.size ?? 0,
    }))
    .sort(comparePublicNetworkNodes);
};
