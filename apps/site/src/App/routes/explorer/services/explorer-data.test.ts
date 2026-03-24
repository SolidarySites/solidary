import { beforeEach, describe, expect, it, vi } from "vitest";

const explorerMocks = vi.hoisted(() => ({
  supabaseFunctionUrl: vi.fn(() => "https://example.supabase.co/functions/v1/index-public-network"),
}));

vi.mock("../../../lib/supabase", () => ({
  supabaseFunctionUrl: explorerMocks.supabaseFunctionUrl,
}));

import { isExplorerRootIndexNode, loadExplorerData } from "./explorer-data";

describe("loadExplorerData", () => {
  beforeEach(() => {
    explorerMocks.supabaseFunctionUrl.mockClear();
    vi.restoreAllMocks();
  });

  it("loads shared public graph nodes and keeps only valid edges", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [
          {
            id: "site-1",
            node_type: "site",
            title: "Alpha",
            description: "",
            canonical_url: "https://alpha.example/",
            image_url: "https://alpha.example/solidary-media/images/site-image_thumb.jpg",
            updated_at: "2026-03-04T00:00:00Z",
            index_level: null,
            parent_index_id: null,
            parent_index_url: null,
            parent_index_level: null,
          },
          {
            id: "index-1",
            node_type: "index",
            title: "Root index",
            description: "Public index",
            canonical_url: "https://index.example/",
            image_url: "",
            updated_at: "2026-03-05T00:00:00Z",
            index_level: 1,
            parent_index_id: null,
            parent_index_url: null,
            parent_index_level: null,
          },
        ],
        edges: [
          {
            id: "site-connection-1",
            edge_type: "site_connection",
            source_id: "site-1",
            target_id: "index-1",
            happened_at: "2026-03-05T00:00:00Z",
          },
          {
            id: "self-loop",
            edge_type: "index_lineage",
            source_id: "index-1",
            target_id: "index-1",
            happened_at: "2026-03-05T00:00:00Z",
          },
          {
            id: "missing-node",
            edge_type: "index_membership",
            source_id: "index-1",
            target_id: "site-3",
            happened_at: "2026-03-05T00:00:00Z",
          },
        ],
      }),
    }));

    const data = await loadExplorerData();

    expect(explorerMocks.supabaseFunctionUrl).toHaveBeenCalledWith("index-public-network");
    expect(data.sites).toEqual([
      {
        id: "site-1",
        nodeType: "site",
        title: "Alpha",
        description: "",
        canonicalUrl: "https://alpha.example/",
        imageUrl: "https://alpha.example/solidary-media/images/site-image_thumb.jpg",
        updatedAt: "2026-03-04T00:00:00Z",
        indexLevel: null,
        parentIndexId: null,
        parentIndexUrl: null,
        parentIndexLevel: null,
      },
      {
        id: "index-1",
        nodeType: "index",
        title: "Root index",
        description: "Public index",
        canonicalUrl: "https://index.example/",
        imageUrl: "",
        updatedAt: "2026-03-05T00:00:00Z",
        indexLevel: 1,
        parentIndexId: null,
        parentIndexUrl: null,
        parentIndexLevel: null,
      },
    ]);
    expect(data.connections).toEqual([
      {
        id: "site-connection-1",
        edgeType: "site_connection",
        sourceId: "site-1",
        targetId: "index-1",
        happenedAt: "2026-03-05T00:00:00Z",
      },
    ]);
  });

  it("throws when the public network function fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "boom" }),
    }));

    await expect(loadExplorerData()).rejects.toThrow("boom");
  });

  it("treats level-zero indexes as the root index", () => {
    expect(
      isExplorerRootIndexNode({
        id: "root-index",
        nodeType: "index",
        title: "Root",
        description: "",
        canonicalUrl: "https://solidary.example/",
        imageUrl: "",
        updatedAt: null,
        indexLevel: 0,
        parentIndexId: null,
        parentIndexUrl: null,
        parentIndexLevel: null,
      })
    ).toBe(true);
  });
});
