import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn()
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: supabaseMocks.from
  }
}));

import { loadPublicSites } from "./public-sites";

const createSitesQuery = (result: { data: unknown; error: { message: string } | null }) => {
  const order = vi.fn(async () => result);
  const select = vi.fn(() => ({
    order
  }));

  return {
    select,
    order
  };
};

describe("loadPublicSites", () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset();
  });

  it("filters invalid rows, resolves thumbnails, and sorts newest-first", async () => {
    const sitesQuery = createSitesQuery({
      data: [
        {
          id: "beta",
          title: "Beta Atlas",
          description: "  Newer published site.  ",
          canonical_url: "https://beta.example/",
          image_url: "/hero.jpg",
          updated_at: "2026-03-04T10:00:00Z"
        },
        {
          id: "gamma",
          title: null,
          description: null,
          canonical_url: "https://gamma.example/collection",
          image_url: "",
          updated_at: "2026-02-15T12:00:00Z"
        },
        {
          id: "alpha",
          title: "Alpha Archive",
          description: "Older tie-break row",
          canonical_url: "https://alpha.example/",
          image_url: "/cover.jpg",
          updated_at: "2026-02-15T12:00:00Z"
        },
        {
          id: "skip-empty-url",
          title: "Should not render",
          description: "No URL",
          canonical_url: "",
          image_url: "",
          updated_at: "2026-03-03T00:00:00Z"
        },
        {
          id: "skip-invalid-url",
          title: "Should not render",
          description: "Bad URL",
          canonical_url: "not-a-url",
          image_url: "",
          updated_at: "2026-03-02T00:00:00Z"
        }
      ],
      error: null
    });

    supabaseMocks.from.mockReturnValue(sitesQuery);

    const sites = await loadPublicSites();

    expect(supabaseMocks.from).toHaveBeenCalledWith("sites");
    expect(sitesQuery.select).toHaveBeenCalledWith(
      "id, title, description, canonical_url, image_url, updated_at"
    );
    expect(sitesQuery.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(sites).toEqual([
      {
        id: "beta",
        title: "Beta Atlas",
        description: "Newer published site.",
        canonicalUrl: "https://beta.example/",
        imageUrl: "https://beta.example/solidary-media/images/site-image_thumb.jpg",
        updatedAt: "2026-03-04T10:00:00Z"
      },
      {
        id: "alpha",
        title: "Alpha Archive",
        description: "Older tie-break row",
        canonicalUrl: "https://alpha.example/",
        imageUrl: "https://alpha.example/solidary-media/images/site-image_thumb.jpg",
        updatedAt: "2026-02-15T12:00:00Z"
      },
      {
        id: "gamma",
        title: "Untitled site",
        description: "",
        canonicalUrl: "https://gamma.example/collection",
        imageUrl:
          "https://gamma.example/collection/solidary-media/images/site-image_thumb.jpg",
        updatedAt: "2026-02-15T12:00:00Z"
      }
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const sitesQuery = createSitesQuery({
      data: null,
      error: {
        message: "boom"
      }
    });

    supabaseMocks.from.mockReturnValue(sitesQuery);

    await expect(loadPublicSites()).rejects.toThrow("boom");
  });
});
