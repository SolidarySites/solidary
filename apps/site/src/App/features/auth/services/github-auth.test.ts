import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn()
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession
    }
  }
}));

import {
  clearCachedGithubProviderCredentialsForUser,
  getFreshGithubAuthSnapshot,
  requireFreshGithubAuth,
  syncGithubAuthSnapshotFromSession,
  syncGithubProviderTokenToServer
} from "./github-auth";

type MockSession = Session & {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

const buildSession = ({
  userId = "user-1",
  supabaseAccessToken = "supabase-access-token",
  providerToken = null,
  providerRefreshToken = null
}: {
  userId?: string;
  supabaseAccessToken?: string;
  providerToken?: string | null;
  providerRefreshToken?: string | null;
} = {}): MockSession =>
  ({
    access_token: supabaseAccessToken,
    refresh_token: "supabase-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId } as Session["user"],
    provider_token: providerToken,
    provider_refresh_token: providerRefreshToken
  } as unknown as MockSession);

describe("getFreshGithubAuthSnapshot", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    clearCachedGithubProviderCredentialsForUser("user-1");
    syncGithubAuthSnapshotFromSession(null);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reuses in-memory session snapshot without calling getSession", async () => {
    syncGithubAuthSnapshotFromSession(buildSession({ providerToken: "gh-token-1" }));

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(authMocks.getSession).not.toHaveBeenCalled();
    expect(snapshot.providerToken).toBe("gh-token-1");
    expect(snapshot.supabaseAccessToken).toBe("supabase-access-token");
  });

  it("reads provider token from session only", async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null, providerRefreshToken: null }) },
      error: null
    });
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => "cached-gh-token"),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    } as unknown as Window);

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(snapshot.providerToken).toBe("");
  });
});

describe("requireFreshGithubAuth", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    clearCachedGithubProviderCredentialsForUser("user-1");
    syncGithubAuthSnapshotFromSession(null);
    vi.unstubAllGlobals();
  });

  it("returns provider token auth when available", async () => {
    syncGithubAuthSnapshotFromSession(
      buildSession({
        providerToken: "gh-token-1"
      })
    );

    const auth = await requireFreshGithubAuth();

    expect(auth.providerToken).toBe("gh-token-1");
  });

  it("returns Supabase auth even when provider token is unavailable", async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null, providerRefreshToken: null }) },
      error: null
    });

    const auth = await requireFreshGithubAuth();

    expect(auth.supabaseAccessToken).toBe("supabase-access-token");
    expect(auth.providerToken).toBe("");
  });
});

describe("syncGithubProviderTokenToServer", () => {
  beforeEach(() => {
    clearCachedGithubProviderCredentialsForUser("user-1");
    syncGithubAuthSnapshotFromSession(null);
    vi.unstubAllGlobals();
  });

  it("skips sync when provider token is missing from session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await syncGithubProviderTokenToServer(
      buildSession({ providerToken: null, providerRefreshToken: null })
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("syncs once per token fingerprint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const session = buildSession({
      providerToken: "provider-token",
      providerRefreshToken: "provider-refresh"
    });

    await syncGithubProviderTokenToServer(session);
    await syncGithubProviderTokenToServer(session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
