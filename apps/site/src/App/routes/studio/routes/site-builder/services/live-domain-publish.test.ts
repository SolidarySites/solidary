import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEMPLATE_SOLIDARY, TEMPLATE_SOLIDARY_LINKS } from "../../../../../../templates/site";
import { FILE_KEYS } from "./constants";

const liveDomainMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  githubRequest: vi.fn(),
  syncConnectedSiteUrls: vi.fn()
}));

vi.mock("../../../../../lib/supabase", () => ({
  supabase: {
    from: liveDomainMocks.from,
    rpc: liveDomainMocks.rpc
  }
}));

vi.mock("../../../../../services/github", () => ({
  githubRequest: liveDomainMocks.githubRequest
}));

vi.mock("./publish/shared", () => ({
  syncConnectedSiteUrls: liveDomainMocks.syncConnectedSiteUrls
}));

import { publishLiveDomainChange } from "./live-domain-publish";

const settingsInput = {
  siteTitle: "Roses Are Red",
  siteDescription: "Poems and petals.",
  siteUrl: "https://jazbogross.github.io/new-site",
  features: {
    dynamicImageLoading: true
  },
  headHtml: "",
  locale: "en-US",
  twitter: true,
  openGraph: true,
  structuredData: true,
  indexFollow: true,
  header: {
    disabled: false,
    fixed: false,
    brandText: "Roses Are Red",
    disableBrand: false
  },
  footer: {
    disabled: false,
    fixed: false,
    modules: [
      { content: "%copyright%", alignment: "left" as const },
      { content: "", alignment: "center" as const },
      { content: "", alignment: "right" as const }
    ]
  }
};

const createDraftUpdateQuery = (result: { data: unknown; error: { message: string } | null }) => {
  const maybeSingle = vi.fn(async () => result);
  const select = vi.fn(() => ({
    maybeSingle
  }));
  const eqRevision = vi.fn(() => ({
    select
  }));
  const eqId = vi.fn(() => ({
    eq: eqRevision
  }));
  const update = vi.fn(() => ({
    eq: eqId
  }));

  return {
    update,
    eqId,
    eqRevision,
    select,
    maybeSingle
  };
};

const createSitesUpsertQuery = (result: { error: { message: string } | null }) => ({
  upsert: vi.fn(async () => result)
});

describe("publishLiveDomainChange", () => {
  beforeEach(() => {
    liveDomainMocks.from.mockReset();
    liveDomainMocks.rpc.mockReset();
    liveDomainMocks.githubRequest.mockReset();
    liveDomainMocks.syncConnectedSiteUrls.mockReset();
  });

  it("persists the canonical URL across draft files, repo commits, and public records", async () => {
    const draftUpdateQuery = createDraftUpdateQuery({
      data: {
        revision: 5,
        last_edited_at: "2026-03-12T12:15:00Z",
        last_edited_by_user_id: "user-1"
      },
      error: null
    });
    const sitesQuery = createSitesUpsertQuery({
      error: null
    });

    liveDomainMocks.from.mockImplementation((table: string) => {
      if (table === "site_drafts") return draftUpdateQuery;
      if (table === "sites") return sitesQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    liveDomainMocks.rpc.mockResolvedValue({ error: null });
    liveDomainMocks.githubRequest.mockResolvedValue({});
    liveDomainMocks.syncConnectedSiteUrls.mockResolvedValue(undefined);

    const result = await publishLiveDomainChange({
      draftState: {
        id: "draft-1",
        siteId: "site-1",
        repoFullName: "jazbogross/new-site",
        branch: "main",
        ownerUserId: "user-1",
        draftType: "owner",
        touchedSections: [],
        touchedPageSlugs: [],
        deletedPageSlugs: [],
        hasPublishPendingChanges: false,
        revision: 4,
        files: {}
      },
      draftFiles: {
        [FILE_KEYS.solidary]:
          '{\n  "site_url": "https://jazbogross.github.io/new-site"\n}\n',
        [FILE_KEYS.solidaryLinks]:
          '{\n  "@id": "https://jazbogross.github.io/new-site",\n  "site_id": "site-1",\n  "connections": [{"@id":"urn:uuid:conn-1","@type":"connection","connected_site":{"@id":"https://connected.example.com","@type":"site","site_id":"site-2"}}]\n}\n'
      },
      templateSolidary: TEMPLATE_SOLIDARY,
      templateSolidaryLinks: TEMPLATE_SOLIDARY_LINKS,
      siteSettingsInput: settingsInput,
      nextSiteUrl: "https://roses-are-red.netlify.app",
      imageUrl: "https://roses-are-red.netlify.app/solidary-media/images/site-image_thumb.jpg",
      sessionUserId: "user-1",
      commitMessage: "Update custom domain",
      workflowMode: "remove"
    });

    expect(draftUpdateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "main",
        commit_sha: "",
        last_edited_by_user_id: "user-1",
        files: expect.objectContaining({
          [FILE_KEYS.astroConfig]: expect.stringContaining("readConfiguredSiteUrl"),
          [FILE_KEYS.robots]: expect.stringContaining("sitemap-index.xml"),
          [FILE_KEYS.solidary]: expect.stringContaining('"site_url": "https://roses-are-red.netlify.app"'),
          [FILE_KEYS.solidaryLinks]: expect.stringContaining('"@id": "https://roses-are-red.netlify.app"')
        })
      })
    );
    const firstDraftUpdateCalls = draftUpdateQuery.update.mock.calls as unknown as Array<
      [{ files?: Record<string, string> }]
    >;
    const firstDraftUpdatePayload = firstDraftUpdateCalls[0]?.[0];
    expect(firstDraftUpdatePayload?.files?.[FILE_KEYS.deployWorkflow]).toBeUndefined();
    expect(liveDomainMocks.rpc).toHaveBeenCalledWith("site_draft_upsert_settings_metadata", {
      p_draft_id: "draft-1",
      p_title: "Roses Are Red",
      p_description: "Poems and petals.",
      p_site_url: "https://roses-are-red.netlify.app",
      p_features: {
        dynamicImageLoading: true
      }
    });
    expect(liveDomainMocks.githubRequest).toHaveBeenCalledWith(
      "github-contents-batch-commit",
      expect.objectContaining({
        owner: "jazbogross",
        repo: "new-site",
        branch: "main",
        message: "Update custom domain",
        deletes: [FILE_KEYS.deployWorkflow],
        upserts: expect.arrayContaining([
          expect.objectContaining({ path: FILE_KEYS.astroConfig }),
          expect.objectContaining({ path: FILE_KEYS.robots }),
          expect.objectContaining({ path: FILE_KEYS.solidary }),
          expect.objectContaining({ path: FILE_KEYS.solidaryLinks }),
          expect.objectContaining({ path: FILE_KEYS.solidaryContent })
        ])
      })
    );
    expect(sitesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "site-1",
        canonical_url: "https://roses-are-red.netlify.app",
        title: "Roses Are Red",
        description: "Poems and petals."
      })
    );
    const siteUpsertCalls = sitesQuery.upsert.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(siteUpsertCalls[0]?.[0]).not.toHaveProperty("image_url");
    expect(liveDomainMocks.syncConnectedSiteUrls).toHaveBeenCalledWith("site-1");
    expect(result.draftFiles[FILE_KEYS.astroConfig]).toContain("readConfiguredSiteUrl");
    expect(result.draftFiles[FILE_KEYS.robots]).toContain("sitemap-index.xml");
    expect(result.draftFiles[FILE_KEYS.deployWorkflow]).toBeUndefined();
    expect(result.solidaryLinksRaw).toContain('"@id": "https://roses-are-red.netlify.app"');
    expect(result.solidaryLinksRaw).toContain('"urn:uuid:conn-1"');
    expect(result.draftRevisionRow.revision).toBe(5);
  });

  it("restores the GitHub Pages deploy workflow when requested", async () => {
    const draftUpdateQuery = createDraftUpdateQuery({
      data: {
        revision: 6,
        last_edited_at: "2026-03-12T12:20:00Z",
        last_edited_by_user_id: "user-1"
      },
      error: null
    });
    const sitesQuery = createSitesUpsertQuery({
      error: null
    });

    liveDomainMocks.from.mockImplementation((table: string) => {
      if (table === "site_drafts") return draftUpdateQuery;
      if (table === "sites") return sitesQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    liveDomainMocks.rpc.mockResolvedValue({ error: null });
    liveDomainMocks.githubRequest.mockResolvedValue({});
    liveDomainMocks.syncConnectedSiteUrls.mockResolvedValue(undefined);

    await publishLiveDomainChange({
      draftState: {
        id: "draft-1",
        siteId: "site-1",
        repoFullName: "jazbogross/new-site",
        branch: "main",
        ownerUserId: "user-1",
        draftType: "owner",
        touchedSections: [],
        touchedPageSlugs: [],
        deletedPageSlugs: [],
        hasPublishPendingChanges: false,
        revision: 5,
        files: {}
      },
      draftFiles: {},
      templateSolidary: TEMPLATE_SOLIDARY,
      templateSolidaryLinks: TEMPLATE_SOLIDARY_LINKS,
      siteSettingsInput: settingsInput,
      nextSiteUrl: "https://jazbogross.github.io/new-site",
      imageUrl: "/solidary-media/images/site-image.jpg",
      sessionUserId: "user-1",
      commitMessage: "Reset domain to GitHub Pages",
      workflowMode: "restore"
    });

    expect(liveDomainMocks.githubRequest).toHaveBeenCalledWith(
      "github-contents-batch-commit",
      expect.objectContaining({
        deletes: [],
        upserts: expect.arrayContaining([
          expect.objectContaining({ path: FILE_KEYS.deployWorkflow })
        ])
      })
    );
    const restoreDraftUpdateCalls = draftUpdateQuery.update.mock.calls as unknown as Array<
      [{ files?: Record<string, string> }]
    >;
    const restoreDraftUpdatePayload = restoreDraftUpdateCalls[0]?.[0];
    expect(restoreDraftUpdatePayload?.files?.[FILE_KEYS.deployWorkflow]).toBeTypeOf("string");
  });
});
