import { beforeEach, describe, expect, it, vi } from "vitest";

const networkMocks = vi.hoisted(() => ({
  loadExplorerData: vi.fn(),
}));

vi.mock("../routes/explorer/services/explorer-data", async () => {
  const actual = await vi.importActual("../routes/explorer/services/explorer-data");
  return {
    ...actual,
    loadExplorerData: networkMocks.loadExplorerData,
  };
});

import { loadPublicNetwork } from "./public-network";

describe("loadPublicNetwork", () => {
  beforeEach(() => {
    networkMocks.loadExplorerData.mockReset();
  });

  it("filters out the local root index and computes connection counts", async () => {
    networkMocks.loadExplorerData.mockResolvedValue({
      sites: [
        {
          id: "root-index",
          nodeType: "index",
          title: "Root",
          description: "",
          canonicalUrl: "https://solidary.example/",
          imageUrl: "",
          updatedAt: "2026-03-01T00:00:00Z",
          indexLevel: 0,
          parentIndexId: "root-index",
          parentIndexUrl: "https://solidary.example/",
          parentIndexLevel: 0,
        },
        {
          id: "child-index",
          nodeType: "index",
          title: "Child",
          description: "Child description",
          canonicalUrl: "https://child.example/",
          imageUrl: "",
          updatedAt: "2026-03-03T00:00:00Z",
          indexLevel: 1,
          parentIndexId: "root-index",
          parentIndexUrl: "https://solidary.example/",
          parentIndexLevel: 0,
        },
        {
          id: "site-1",
          nodeType: "site",
          title: "Alpha",
          description: "",
          canonicalUrl: "https://alpha.example/",
          imageUrl: "",
          updatedAt: "2026-03-02T00:00:00Z",
          indexLevel: null,
          parentIndexId: "child-index",
          parentIndexUrl: "https://child.example/",
          parentIndexLevel: 1,
        },
      ],
      connections: [
        {
          id: "edge-1",
          edgeType: "site_connection",
          sourceId: "child-index",
          targetId: "site-1",
          happenedAt: "2026-03-03T00:00:00Z",
        },
      ],
    });

    const nodes = await loadPublicNetwork();

    expect(nodes).toEqual([
      expect.objectContaining({
        id: "child-index",
        nodeType: "index",
        connectionCount: 1,
      }),
      expect.objectContaining({
        id: "site-1",
        nodeType: "site",
        connectionCount: 1,
      }),
    ]);
  });
});
