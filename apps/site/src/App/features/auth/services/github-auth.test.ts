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
  cacheGithubProviderCredentialsFromSession,
  clearCachedGithubProviderCredentialsForUser,
  getFreshGithubAuthSnapshot,
  requireFreshGithubAuth,
  syncGithubAuthSnapshotFromSession
} from "./github-auth";

type MockSession = Session & {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

const PROVIDER_TOKEN_STORAGE_KEY = "solidary:github-provider-token:user-1";
const PROVIDER_REFRESH_TOKEN_STORAGE_KEY = "solidary:github-provider-refresh-token:user-1";

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

const createLocalStorageMock = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    }
  };
};

const stubWindowWithLocalStorage = () => {
  const localStorage = createLocalStorageMock();
  vi.stubGlobal("window", { localStorage } as unknown as Window);
  return localStorage;
};

describe("getFreshGithubAuthSnapshot", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    clearCachedGithubProviderCredentialsForUser("user-1");
    syncGithubAuthSnapshotFromSession(null);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reuses in-memory session snapshot without calling getSession", async () => {
    stubWindowWithLocalStorage();
    syncGithubAuthSnapshotFromSession(buildSession({ providerToken: "gh-token-1" }));

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(authMocks.getSession).not.toHaveBeenCalled();
    expect(snapshot.providerToken).toBe("gh-token-1");
    expect(snapshot.supabaseAccessToken).toBe("supabase-access-token");
  });

  it("falls back to cached provider token from localStorage", async () => {
    const localStorage = stubWindowWithLocalStorage();
    localStorage.setItem(PROVIDER_TOKEN_STORAGE_KEY, "cached-gh-token");
    authMocks.getSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null, providerRefreshToken: null }) },
      error: null
    });

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(snapshot.providerToken).toBe("cached-gh-token");
  });

  it("refreshes GitHub provider token server-side when refresh token exists", async () => {
    const localStorage = stubWindowWithLocalStorage();
    authMocks.getSession.mockResolvedValue({
      data: {
        session: buildSession({
          providerToken: null,
          providerRefreshToken: "provider-refresh-token-1"
        })
      },
      error: null
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          provider_token: "refreshed-provider-token",
          provider_refresh_token: "provider-refresh-token-2"
        })
      })) as unknown as typeof fetch
    );

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(snapshot.providerToken).toBe("refreshed-provider-token");
    expect(localStorage.getItem(PROVIDER_TOKEN_STORAGE_KEY)).toBe("refreshed-provider-token");
    expect(localStorage.getItem(PROVIDER_REFRESH_TOKEN_STORAGE_KEY)).toBe(
      "provider-refresh-token-2"
    );
  });

  it("throttles repeated provider refresh attempts after a failed refresh", async () => {
    stubWindowWithLocalStorage();
    authMocks.getSession.mockResolvedValue({
      data: {
        session: buildSession({
          providerToken: null,
          providerRefreshToken: "provider-refresh-token-1"
        })
      },
      error: null
    });

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: "Refresh failed."
      })
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const firstSnapshot = await getFreshGithubAuthSnapshot();
    const secondSnapshot = await getFreshGithubAuthSnapshot();

    expect(firstSnapshot.providerToken).toBe("");
    expect(secondSnapshot.providerToken).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("provider credential cache helpers", () => {
  beforeEach(() => {
    clearCachedGithubProviderCredentialsForUser("user-1");
    syncGithubAuthSnapshotFromSession(null);
    vi.unstubAllGlobals();
  });

  it("stores both provider token and provider refresh token from session", () => {
    const localStorage = stubWindowWithLocalStorage();

    cacheGithubProviderCredentialsFromSession(
      buildSession({
        providerToken: "stored-provider-token",
        providerRefreshToken: "stored-provider-refresh-token"
      })
    );

    expect(localStorage.getItem(PROVIDER_TOKEN_STORAGE_KEY)).toBe("stored-provider-token");
    expect(localStorage.getItem(PROVIDER_REFRESH_TOKEN_STORAGE_KEY)).toBe(
      "stored-provider-refresh-token"
    );
  });

  it("clears provider token and refresh token cache for a user", () => {
    const localStorage = stubWindowWithLocalStorage();
    localStorage.setItem(PROVIDER_TOKEN_STORAGE_KEY, "stored-provider-token");
    localStorage.setItem(PROVIDER_REFRESH_TOKEN_STORAGE_KEY, "stored-provider-refresh-token");

    clearCachedGithubProviderCredentialsForUser("user-1");

    expect(localStorage.getItem(PROVIDER_TOKEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PROVIDER_REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
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
    stubWindowWithLocalStorage();
    syncGithubAuthSnapshotFromSession(
      buildSession({
        providerToken: "gh-token-1"
      })
    );

    const auth = await requireFreshGithubAuth();

    expect(auth.providerToken).toBe("gh-token-1");
  });

  it("throws a reconnect message instead of redirecting or signing out", async () => {
    stubWindowWithLocalStorage();
    authMocks.getSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null, providerRefreshToken: null }) },
      error: null
    });

    await expect(requireFreshGithubAuth()).rejects.toThrow(
      "GitHub authorization missing. Reconnect GitHub from the header and retry."
    );
  });
});
