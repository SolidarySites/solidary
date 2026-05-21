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
  sourceId: string;
  targetId: string;
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

export type ExplorerGraphIndex = {
  sitesById: Record<string, ExplorerSite>;
  siteIds: string[];
  normalizedConnections: ExplorerConnection[];
  adjacencyBySiteId: Record<string, string[]>;
  degreeBySiteId: Record<string, number>;
};

export type ExplorerLoadedGraphState = {
  nodesById: Record<string, ExplorerGraphNode>;
  loadedSiteIds: string[];
  randomCursor: number;
};

export {
  buildConnectedSiteLookup,
  buildExplorerGraphIndex,
  getExplorerGraphWorldSize
} from "./explorer-graph-index";

export {
  loadExplorerRandomUnitValues,
  loadLocalRandomUnitValues
} from "./explorer-graph-random";

export {
  createInitialLoadedGraphState,
  expandLoadedGraphState,
  buildExplorerGraphFromLoaded
} from "./explorer-graph-layout";
