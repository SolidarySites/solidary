import { describe, expect, it } from "vitest";
import {
  buildExplorerGraphFromLoaded,
  buildExplorerGraphIndex,
  createInitialLoadedGraphState
} from "./explorer-graph";

const sites = [
  {
    id: "a",
    nodeType: "site",
    title: "Alpha",
    description: "",
    canonicalUrl: "https://a.example.com",
    imageUrl: "",
    updatedAt: null,
    indexLevel: null,
    parentIndexId: null,
    parentIndexUrl: null,
    parentIndexLevel: null
  },
  {
    id: "b",
    nodeType: "site",
    title: "Beta",
    description: "",
    canonicalUrl: "https://b.example.com",
    imageUrl: "",
    updatedAt: null,
    indexLevel: null,
    parentIndexId: null,
    parentIndexUrl: null,
    parentIndexLevel: null
  }
] as const;

const connections = [
  {
    id: "edge-1",
    edgeType: "site_connection",
    sourceId: "a",
    targetId: "b",
    happenedAt: null
  },
  {
    id: "edge-duplicate",
    edgeType: "site_connection",
    sourceId: "b",
    targetId: "a",
    happenedAt: null
  }
] as const;

describe("explorer-graph", () => {
  it("deduplicates symmetric connections in the graph index", () => {
    const index = buildExplorerGraphIndex({
      sites: [...sites],
      connections: [...connections]
    });

    expect(index.normalizedConnections).toHaveLength(1);
    expect(index.degreeBySiteId).toEqual({
      a: 1,
      b: 1
    });
  });

  it("materializes nodes and edges from loaded graph state", () => {
    const index = buildExplorerGraphIndex({
      sites: [...sites],
      connections: [...connections]
    });

    const state = createInitialLoadedGraphState({
      index,
      randomUnitValues: [0.25, 0.75, 0.5, 0.1],
      initialCount: 2,
      worldWidth: 800,
      worldHeight: 600,
      minDistance: 32
    });

    const graph = buildExplorerGraphFromLoaded({
      index,
      state
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      sourceId: "a",
      targetId: "b"
    });
  });
});
