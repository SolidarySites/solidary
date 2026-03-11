import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSite } from "../../../services/public-sites";

const explorerMocks = vi.hoisted(() => ({
  from: vi.fn(),
  loadPublicSites: vi.fn()
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: explorerMocks.from
  }
}));

vi.mock("../../../services/public-sites", () => ({
  loadPublicSites: explorerMocks.loadPublicSites
}));

import { loadExplorerData } from "./explorer-data";

const createConnectionsQuery = (result: { data: unknown; error: { message: string } | null }) => {
  const order = vi.fn(async () => result);
  const eq = vi.fn(() => ({
    order
  }));
  const select = vi.fn(() => ({
    eq
  }));

  return {
    select,
    eq,
    order
  };
};

describe("loadExplorerData", () => {
  beforeEach(() => {
    explorerMocks.from.mockReset();
    explorerMocks.loadPublicSites.mockReset();
  });

  it("reuses public sites and keeps only valid approved connections", async () => {
    const publicSites: PublicSite[] = [
      {
        id: "site-1",
        title: "Alpha",
        description: "",
        canonicalUrl: "https://alpha.example/",
        imageUrl: "https://alpha.example/solidary-media/images/site-image_thumb.jpg",
        updatedAt: "2026-03-04T00:00:00Z"
      },
      {
        id: "site-2",
        title: "Beta",
        description: "",
        canonicalUrl: "https://beta.example/",
        imageUrl: "https://beta.example/solidary-media/images/site-image_thumb.jpg",
        updatedAt: "2026-03-03T00:00:00Z"
      }
    ];
    const connectionsQuery = createConnectionsQuery({
      data: [
        {
          connection_uuid: "valid-connection",
          source_site_id: "site-1",
          target_site_id: "site-2",
          responded_at: "2026-03-03T00:00:00Z"
        },
        {
          connection_uuid: "self-link",
          source_site_id: "site-1",
          target_site_id: "site-1",
          responded_at: "2026-03-03T00:00:00Z"
        },
        {
          connection_uuid: "missing-site",
          source_site_id: "site-1",
          target_site_id: "site-3",
          responded_at: "2026-03-03T00:00:00Z"
        }
      ],
      error: null
    });

    explorerMocks.loadPublicSites.mockResolvedValue(publicSites);
    explorerMocks.from.mockReturnValue(connectionsQuery);

    const data = await loadExplorerData();

    expect(explorerMocks.loadPublicSites).toHaveBeenCalledTimes(1);
    expect(explorerMocks.from).toHaveBeenCalledWith("site_connection_requests");
    expect(connectionsQuery.select).toHaveBeenCalledWith(
      "connection_uuid, source_site_id, target_site_id, responded_at"
    );
    expect(connectionsQuery.eq).toHaveBeenCalledWith("status", "approved");
    expect(connectionsQuery.order).toHaveBeenCalledWith("responded_at", {
      ascending: false
    });
    expect(data.sites).toEqual(publicSites);
    expect(data.connections).toEqual([
      {
        connectionUuid: "valid-connection",
        sourceSiteId: "site-1",
        targetSiteId: "site-2",
        approvedAt: "2026-03-03T00:00:00Z"
      }
    ]);
  });
});
