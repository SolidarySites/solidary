import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn()
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      refreshSession: authMocks.refreshSession
    }
  }
}));

import { getFreshGithubAuthSnapshot } from "./github-auth";

type MockSession = Session & {
  provider_token?: string | null;
};

const PROVIDER_TOKEN_STORAGE_KEY = "solidary:github-provider-token:user-1";

const buildSession = ({
  userId = "user-1",
  supabaseAccessToken = "supabase-access-token",
  providerToken = null
}: {
  userId?: string;
  supabaseAccessToken?: string;
  providerToken?: string | null;
} = {}): MockSession =>
  ({
    access_token: supabaseAccessToken,
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId } as Session["user"],
    provider_token: providerToken
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
    authMocks.refreshSession.mockReset();
    vi.unstubAllGlobals();
  });

  it("uses provider token from session without refresh and stores it", async () => {
    const localStorage = stubWindowWithLocalStorage();
    const session = buildSession({ providerToken: "gh-token-1" });
    authMocks.getSession.mockResolvedValue({
      data: { session },
      error: null
    });

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(authMocks.refreshSession).not.toHaveBeenCalled();
    expect(snapshot.providerToken).toBe("gh-token-1");
    expect(snapshot.supabaseAccessToken).toBe("supabase-access-token");
    expect(localStorage.getItem(PROVIDER_TOKEN_STORAGE_KEY)).toBe("gh-token-1");
  });

  it("refreshes session when provider token is missing", async () => {
    stubWindowWithLocalStorage();
    authMocks.getSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null }) },
      error: null
    });
    authMocks.refreshSession.mockResolvedValue({
      data: {
        session: buildSession({
          providerToken: "gh-token-2",
          supabaseAccessToken: "refreshed-supabase-token"
        })
      },
      error: null
    });

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(authMocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(snapshot.providerToken).toBe("gh-token-2");
    expect(snapshot.supabaseAccessToken).toBe("refreshed-supabase-token");
  });

  it("falls back to cached provider token when refresh still has no provider token", async () => {
    const localStorage = stubWindowWithLocalStorage();
    localStorage.setItem(PROVIDER_TOKEN_STORAGE_KEY, "cached-gh-token");

    authMocks.getSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null }) },
      error: null
    });
    authMocks.refreshSession.mockResolvedValue({
      data: { session: buildSession({ providerToken: null }) },
      error: null
    });

    const snapshot = await getFreshGithubAuthSnapshot();

    expect(authMocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(snapshot.providerToken).toBe("cached-gh-token");
  });
});
