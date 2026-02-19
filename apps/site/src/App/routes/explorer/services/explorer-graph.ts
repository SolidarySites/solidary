import type { ExplorerConnection, ExplorerSite } from "./explorer-data";

export type ExplorerGraphNode = {
  siteId: string;
  title: string;
  canonicalUrl: string;
  x: number;
  y: number;
  degree: number;
  radius: number;
};

export type ExplorerGraphEdge = {
  key: string;
  sourceSiteId: string;
  targetSiteId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type ExplorerGraph = {
  nodes: ExplorerGraphNode[];
  edges: ExplorerGraphEdge[];
  degreeBySiteId: Record<string, number>;
};

const GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5));

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeConnections = (
  connections: ExplorerConnection[]
): ExplorerConnection[] => {
  const seen = new Set<string>();
  const next: ExplorerConnection[] = [];
  for (const connection of connections) {
    const left =
      connection.sourceSiteId < connection.targetSiteId
        ? connection.sourceSiteId
        : connection.targetSiteId;
    const right =
      connection.sourceSiteId < connection.targetSiteId
        ? connection.targetSiteId
        : connection.sourceSiteId;
    const key = `${left}:${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(connection);
  }
  return next;
};

export const buildExplorerGraph = ({
  sites,
  connections,
  width,
  height
}: {
  sites: ExplorerSite[];
  connections: ExplorerConnection[];
  width: number;
  height: number;
}): ExplorerGraph => {
  if (!sites.length) {
    return {
      nodes: [],
      edges: [],
      degreeBySiteId: {}
    };
  }

  const normalizedConnections = normalizeConnections(connections);
  const degreeBySiteId: Record<string, number> = {};
  sites.forEach((site) => {
    degreeBySiteId[site.id] = 0;
  });
  normalizedConnections.forEach((connection) => {
    degreeBySiteId[connection.sourceSiteId] = (degreeBySiteId[connection.sourceSiteId] ?? 0) + 1;
    degreeBySiteId[connection.targetSiteId] = (degreeBySiteId[connection.targetSiteId] ?? 0) + 1;
  });

  const sortedSites = [...sites].sort((left, right) => {
    const leftDegree = degreeBySiteId[left.id] ?? 0;
    const rightDegree = degreeBySiteId[right.id] ?? 0;
    if (leftDegree !== rightDegree) return rightDegree - leftDegree;
    return left.title.localeCompare(right.title);
  });

  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.max(90, Math.min(width, height) * 0.44);
  const innerRadius = Math.max(36, outerRadius * 0.12);
  const total = sortedSites.length;

  const nodes = sortedSites.map((site, index) => {
    const progress = total <= 1 ? 0 : (index + 0.5) / total;
    const radial = innerRadius + (outerRadius - innerRadius) * Math.sqrt(progress);
    const angle = index * GOLDEN_ANGLE_RADIANS - Math.PI / 2;
    const x = clamp(cx + radial * Math.cos(angle), 16, width - 16);
    const y = clamp(cy + radial * Math.sin(angle), 16, height - 16);
    const degree = degreeBySiteId[site.id] ?? 0;
    return {
      siteId: site.id,
      title: site.title,
      canonicalUrl: site.canonicalUrl,
      x,
      y,
      degree,
      radius: clamp(6 + degree * 1.4, 6, 16)
    } satisfies ExplorerGraphNode;
  });

  const nodesById = new Map(nodes.map((node) => [node.siteId, node]));
  const edges = normalizedConnections
    .map((connection) => {
      const source = nodesById.get(connection.sourceSiteId);
      const target = nodesById.get(connection.targetSiteId);
      if (!source || !target) return null;
      const left = source.siteId < target.siteId ? source.siteId : target.siteId;
      const right = source.siteId < target.siteId ? target.siteId : source.siteId;
      return {
        key: `${left}:${right}`,
        sourceSiteId: source.siteId,
        targetSiteId: target.siteId,
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y
      } satisfies ExplorerGraphEdge;
    })
    .filter((edge): edge is ExplorerGraphEdge => Boolean(edge));

  return {
    nodes,
    edges,
    degreeBySiteId
  };
};

export const buildConnectedSiteLookup = (connections: ExplorerConnection[]) => {
  const connectedBySiteId: Record<string, Set<string>> = {};
  normalizeConnections(connections).forEach((connection) => {
    if (!connectedBySiteId[connection.sourceSiteId]) {
      connectedBySiteId[connection.sourceSiteId] = new Set<string>();
    }
    if (!connectedBySiteId[connection.targetSiteId]) {
      connectedBySiteId[connection.targetSiteId] = new Set<string>();
    }
    connectedBySiteId[connection.sourceSiteId]?.add(connection.targetSiteId);
    connectedBySiteId[connection.targetSiteId]?.add(connection.sourceSiteId);
  });
  return connectedBySiteId;
};
