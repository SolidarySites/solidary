import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn()
}));

vi.mock("../../auth/services/github-auth", () => ({
  requireFreshSupabaseAuth: vi.fn(async () => ({
    session: {
      user: { id: "user-1" }
    } as Session,
    supabaseAccessToken: "supabase-access-token",
    providerToken: ""
  }))
}));

vi.mock("../../../lib/supabase", () => ({
  supabaseFunctionUrl: (functionName: string) =>
    `https://example.supabase.co/functions/v1/${functionName}`,
  supabase: {
    auth: {
      getSession: authMocks.getSession
    }
  }
}));

import {
  getSupabaseManagementStatusForCurrentUser,
  normalizeSupabaseManagementStatusPayload,
  parseSupabaseManagementConnectResultFromSearch,
  parseSupabaseManagementConnectResultMessagePayload
} from "./supabase-management";

describe("normalizeSupabaseManagementStatusPayload", () => {
  it("normalizes connection state, scopes, organizations, and projects", () => {
    const status = normalizeSupabaseManagementStatusPayload({
      connected: true,
      state: "connected",
      message: null,
      granted_scopes: ["organizations:read", "projects:read", "projects:read"],
      organizations: [
        {
          id: "org-1",
          slug: "studio",
          name: "Studio"
        }
      ],
      projects: [
        {
          id: "project-1",
          ref: "abcd",
          organizationId: "org-1",
          organizationSlug: "studio",
          name: "Archive Index",
          region: "eu-west-1",
          status: "ACTIVE_HEALTHY"
        }
      ],
      projects_truncated: true
    });

    expect(status.connected).toBe(true);
    expect(status.state).toBe("connected");
    expect(status.grantedScopes).toEqual(["organizations:read", "projects:read"]);
    expect(status.organizations).toEqual([
      {
        id: "org-1",
        slug: "studio",
        name: "Studio"
      }
    ]);
    expect(status.projects).toEqual([
      {
        id: "project-1",
        ref: "abcd",
        organizationId: "org-1",
        organizationSlug: "studio",
        name: "Archive Index",
        region: "eu-west-1",
        status: "ACTIVE_HEALTHY"
      }
    ]);
    expect(status.projectsTruncated).toBe(true);
  });
});

describe("parseSupabaseManagementConnectResult helpers", () => {
  it("reads popup message payloads", () => {
    expect(
      parseSupabaseManagementConnectResultMessagePayload({
        type: "solidary:supabase-management-connect-result",
        status: "connected",
        message: "Supabase account connected."
      })
    ).toEqual({
      status: "connected",
      message: "Supabase account connected."
    });
  });

  it("reads callback query params", () => {
    expect(
      parseSupabaseManagementConnectResultFromSearch(
        "?supabase_management=error&supabase_management_message=Needs%20reauth"
      )
    ).toEqual({
      status: "error",
      message: "Needs reauth"
    });
  });
});

describe("getSupabaseManagementStatusForCurrentUser", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the status endpoint payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        connected: false,
        state: "needs_reauth",
        message: "Reconnect required.",
        granted_scopes: ["projects:write"],
        organizations: [],
        projects: [],
        projects_truncated: false
      })
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const status = await getSupabaseManagementStatusForCurrentUser();

    expect(status.connected).toBe(false);
    expect(status.state).toBe("needs_reauth");
    expect(status.message).toBe("Reconnect required.");
    expect(status.grantedScopes).toEqual(["projects:write"]);
  });
});
