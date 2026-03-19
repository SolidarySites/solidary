import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("../../../../lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: persistenceMocks.authGetUser
    },
    from: persistenceMocks.from,
    rpc: persistenceMocks.rpc
  }
}));

import { saveProvisionedSiteDraft } from "./persistence";

const baseSession = {
  user: {
    id: "user-1"
  },
  expires_at: 1_900_000_000
} as Session;

const baseParams = {
  session: baseSession,
  siteId: "site-1",
  siteTitle: "New Site",
  siteDescription: "A fresh site.",
  siteUrl: "https://example.com",
  siteUrlResolved: "https://example.com",
  siteRecordImageUrl: "/solidary-media/images/site-image.jpg",
  imageUrl: "/solidary-media/images/site-image_thumb.jpg",
  repoFullName: "jazbogross/new-site",
  defaultBranch: "main",
  solidaryFile: "{}",
  solidaryLinksFile: "{}",
  tokensCss: ":root {}",
  pages: [
    {
      slug: "home",
      title: "Home",
      body: "",
      showInNav: false
    }
  ]
};

const createInsertQuery = (result: { error: { message: string; code?: string } | null }) => ({
  insert: vi.fn(async () => result)
});

const createUpsertQuery = (result: { error: { message: string; code?: string } | null }) => ({
  upsert: vi.fn(async () => result)
});

describe("saveProvisionedSiteDraft", () => {
  beforeEach(() => {
    persistenceMocks.authGetUser.mockReset();
    persistenceMocks.from.mockReset();
    persistenceMocks.rpc.mockReset();
  });

  it("loads the root index from federation state and creates the root connection before index membership", async () => {
    const sitesQuery = createInsertQuery({ error: null });
    const siteDraftsQuery = createInsertQuery({ error: null });
    const indexSitesQuery = createInsertQuery({ error: null });
    const siteDraftSettingsQuery = createUpsertQuery({ error: null });
    const siteDraftPagesQuery = createInsertQuery({ error: null });

    persistenceMocks.authGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1"
        }
      },
      error: null
    });
    persistenceMocks.rpc
      .mockResolvedValueOnce({
        data: {
          index: {
            id: "root-index-1",
            canonical_url: "https://solidary.netlify.app",
            index_level: 0
          }
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: null,
        error: null
      });
    persistenceMocks.from.mockImplementation((table: string) => {
      if (table === "sites") return sitesQuery;
      if (table === "site_drafts") return siteDraftsQuery;
      if (table === "index_sites") return indexSitesQuery;
      if (table === "site_draft_settings") return siteDraftSettingsQuery;
      if (table === "site_draft_pages") return siteDraftPagesQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    await saveProvisionedSiteDraft(baseParams);

    expect(persistenceMocks.rpc).toHaveBeenNthCalledWith(1, "rpc_index_federation_state");
    expect(sitesQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "site-1",
        parent_index_id: "root-index-1",
        parent_index_url: "https://solidary.netlify.app",
        parent_index_level: 0
      })
    );
    expect(persistenceMocks.rpc).toHaveBeenNthCalledWith(2, "connection_create_site_index", {
      p_source_site_id: "site-1",
      p_target_index_id: "root-index-1",
      p_connection_uuid: null
    });
    expect(persistenceMocks.from.mock.calls.map(([table]) => table)).toEqual([
      "sites",
      "site_drafts",
      "index_sites",
      "site_draft_settings",
      "site_draft_pages"
    ]);
    expect(indexSitesQuery.insert).toHaveBeenCalledWith({
      index_id: "root-index-1",
      site_id: "site-1",
      status: "tracked",
      delist_reason_code: null,
      delist_note: null
    });
  });

  it("fails before any writes when the federation state does not expose a root index", async () => {
    persistenceMocks.authGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1"
        }
      },
      error: null
    });
    persistenceMocks.rpc.mockResolvedValue({
      data: {
        index: null
      },
      error: null
    });

    await expect(saveProvisionedSiteDraft(baseParams)).rejects.toThrow(
      "Root index is missing."
    );

    expect(persistenceMocks.from).not.toHaveBeenCalled();
  });
});
