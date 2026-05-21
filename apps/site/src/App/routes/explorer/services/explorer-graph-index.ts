import type { ExplorerConnection, ExplorerSite } from "./explorer-data";
import type { ExplorerGraphIndex } from "./explorer-graph";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clampInt = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

const normalizeConnections = (connections: ExplorerConnection[]): ExplorerConnection[] => {
  const seen = new Set<string>();
  const normalized: ExplorerConnection[] = [];
  for (const connection of connections) {
    if (connection.sourceId === connection.targetId) continue;
    const left =
      connection.sourceId < connection.targetId
        ? connection.sourceId
        : connection.targetId;
    const right =
      connection.sourceId < connection.targetId
        ? connection.targetId
        : connection.sourceId;
    const key = `${left}:${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(connection);
  }
  return normalized;
};

export const buildConnectedSiteLookup = (connections: ExplorerConnection[]) => {
  const connectedBySiteId: Record<string, Set<string>> = {};
  normalizeConnections(connections).forEach((connection) => {
    if (!connectedBySiteId[connection.sourceId]) {
      connectedBySiteId[connection.sourceId] = new Set<string>();
    }
    if (!connectedBySiteId[connection.targetId]) {
      connectedBySiteId[connection.targetId] = new Set<string>();
    }
    connectedBySiteId[connection.sourceId]?.add(connection.targetId);
    connectedBySiteId[connection.targetId]?.add(connection.sourceId);
  });
  return connectedBySiteId;
};

export const buildExplorerGraphIndex = ({
  sites,
  connections
}: {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
}): ExplorerGraphIndex => {
  const sitesById: Record<string, ExplorerSite> = {};
  sites.forEach((site) => {
    sitesById[site.id] = site;
  });
  const siteIds = Object.keys(sitesById);

  const adjacencyBySiteId: Record<string, string[]> = {};
  siteIds.forEach((siteId) => {
    adjacencyBySiteId[siteId] = [];
  });

  const normalizedConnections = normalizeConnections(connections).filter(
    (connection) => Boolean(sitesById[connection.sourceId] && sitesById[connection.targetId])
  );
  normalizedConnections.forEach((connection) => {
    adjacencyBySiteId[connection.sourceId]?.push(connection.targetId);
    adjacencyBySiteId[connection.targetId]?.push(connection.sourceId);
  });

  const degreeBySiteId: Record<string, number> = {};
  siteIds.forEach((siteId) => {
    degreeBySiteId[siteId] = adjacencyBySiteId[siteId]?.length ?? 0;
  });

  return {
    sitesById,
    siteIds,
    normalizedConnections,
    adjacencyBySiteId,
    degreeBySiteId
  };
};

export const getExplorerGraphWorldSize = ({
  siteCount,
  viewportWidth,
  viewportHeight
}: {
  siteCount: number;
  viewportWidth: number;
  viewportHeight: number;
}) => {
  const baseWidth = Math.max(viewportWidth * 2.2, 1200);
  const baseHeight = Math.max(viewportHeight * 2.2, 900);
  if (siteCount <= 0) {
    return {
      width: clampInt(baseWidth, 1200, 2400),
      height: clampInt(baseHeight, 900, 2200)
    };
  }

  const siteDensity = 1250;
  const areaFromSites = siteCount * siteDensity;
  const ratio = 1.6;
  const widthFromSites = Math.sqrt(areaFromSites * ratio);
  const heightFromSites = Math.sqrt(areaFromSites / ratio);

  return {
    width: clampInt(Math.max(baseWidth, widthFromSites), 1200, 26000),
    height: clampInt(Math.max(baseHeight, heightFromSites), 900, 20000)
  };
};
