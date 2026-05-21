import { describe, expect, it } from "vitest";
import { buildIndexListItemFromState, buildSearchParams, getFriendlyErrorMessage } from "./adminRouteShared";

describe("adminRouteShared", () => {
  it("prefers the actual error message when available", () => {
    expect(getFriendlyErrorMessage(new Error("Broken"), "Fallback")).toBe("Broken");
    expect(getFriendlyErrorMessage(new Error("   "), "Fallback")).toBe("Fallback");
  });

  it("updates the admin search params and optionally clears the created flag", () => {
    const params = buildSearchParams({
      current: new URLSearchParams("created=1&section=general"),
      indexId: "archive-2",
      section: "danger",
      clearCreated: true
    });

    expect(params.get("indexId")).toBe("archive-2");
    expect(params.get("section")).toBe("danger");
    expect(params.has("created")).toBe(false);
  });

  it("maps admin state into an index list item", () => {
    const item = buildIndexListItemFromState({
      actor: {
        userId: "user-1",
        role: "admin",
        via: "session",
        canEditGeneral: true,
        canManageConnections: true,
        canManageCollaborators: true,
        canManageAdvanced: true
      },
      index: {
        id: "archive-1",
        slug: "archive",
        title: "Archive",
        description: "Primary archive",
        imageUrl: "https://example.com/image.png",
        canonicalUrl: "https://archive.example.com",
        repoFullName: "owner/archive",
        repoUrl: "https://github.com/owner/archive",
        supabaseProjectRef: "project-ref",
        supabaseDashboardUrl: "https://supabase.com/dashboard/project/project-ref",
        supabaseProjectUrl: "",
        supabasePublishableKey: "",
        indexLevel: 2,
        parentIndexId: "parent-1",
        parentIndexUrl: "https://parent.example.com",
        parentIndexLevel: 1,
        parentRepoFullName: null,
        parentRepoUrl: null,
        type: "index",
        standaloneAdminUrl: "",
        solidaryAdminUrl: "",
        authCallbackUrl: "",
        authProvidersDashboardUrl: ""
      },
      connections: [],
      collaborators: [],
      owner: null
    });

    expect(item).toMatchObject({
      id: "archive-1",
      slug: "archive",
      accessRole: "admin",
      parentIndexId: "parent-1"
    });
  });
});
