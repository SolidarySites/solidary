import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

type SessionWithProviderCredentials = Session & {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

const GITHUB_PROVIDER_TOKEN_STORAGE_PREFIX = "solidary:github-provider-token:";
const GITHUB_PROVIDER_REFRESH_TOKEN_STORAGE_PREFIX = "solidary:github-provider-refresh-token:";
const GITHUB_PROVIDER_TOKEN_REFRESH_COOLDOWN_MS = 60 * 1000;

export const GITHUB_OAUTH_SCOPES = "repo delete_repo workflow";

export type FreshGithubAuthSnapshot = {
  session: Session | null;
  providerToken: string;
  supabaseAccessToken: string;
};

export type FreshGithubAuth = {
  session: Session;
  providerToken: string;
  supabaseAccessToken: string;
};

export type FreshSupabaseAuth = {
  session: Session;
  supabaseAccessToken: string;
  providerToken: string;
};

type InternalGithubAuthSnapshot = FreshGithubAuthSnapshot & {
  providerRefreshToken: string;
};

type RefreshProviderTokenResponse = {
  provider_token?: string;
  provider_refresh_token?: string;
};

const providerTokenRefreshAttemptAtByUserId = new Map<string, number>();
let inMemorySnapshot: InternalGithubAuthSnapshot | null = null;

const getSessionProviderToken = (session: Session | null): string => {
  if (!session) return "";
  return ((session as SessionWithProviderCredentials).provider_token ?? "").trim();
};

const getSessionProviderRefreshToken = (session: Session | null): string => {
  if (!session) return "";
  return ((session as SessionWithProviderCredentials).provider_refresh_token ?? "").trim();
};

const getSessionSupabaseAccessToken = (session: Session | null): string => {
  return session?.access_token?.trim() ?? "";
};

const getSessionUserId = (session: Session | null): string => {
  return session?.user?.id?.trim() ?? "";
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getGithubProviderTokenStorageKey = (userId: string) =>
  `${GITHUB_PROVIDER_TOKEN_STORAGE_PREFIX}${userId}`;

const getGithubProviderRefreshTokenStorageKey = (userId: string) =>
  `${GITHUB_PROVIDER_REFRESH_TOKEN_STORAGE_PREFIX}${userId}`;

const writeStorageValue = (key: string, value: string) => {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    if (value) {
      storage.setItem(key, value);
      return;
    }
    storage.removeItem(key);
  } catch {
    // Ignore storage write failures (private mode/quota/permissions).
  }
};

const readStorageValue = (key: string): string => {
  const storage = getLocalStorage();
  if (!storage) return "";

  try {
    return storage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
};

const writeStoredProviderToken = (userId: string, providerToken: string) => {
  writeStorageValue(getGithubProviderTokenStorageKey(userId), providerToken);
};

const readStoredProviderToken = (userId: string): string => {
  return readStorageValue(getGithubProviderTokenStorageKey(userId));
};

const writeStoredProviderRefreshToken = (userId: string, providerRefreshToken: string) => {
  writeStorageValue(getGithubProviderRefreshTokenStorageKey(userId), providerRefreshToken);
};

const readStoredProviderRefreshToken = (userId: string): string => {
  return readStorageValue(getGithubProviderRefreshTokenStorageKey(userId));
};

const removeStoredProviderCredentials = (userId: string) => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  writeStoredProviderToken(normalizedUserId, "");
  writeStoredProviderRefreshToken(normalizedUserId, "");
};

const createSnapshotFromSession = (session: Session | null): InternalGithubAuthSnapshot => {
  const userId = getSessionUserId(session);
  const sessionProviderToken = getSessionProviderToken(session);
  const sessionProviderRefreshToken = getSessionProviderRefreshToken(session);
  const storedProviderToken = userId ? readStoredProviderToken(userId) : "";
  const storedProviderRefreshToken = userId ? readStoredProviderRefreshToken(userId) : "";

  return {
    session,
    providerToken: sessionProviderToken || storedProviderToken,
    providerRefreshToken: sessionProviderRefreshToken || storedProviderRefreshToken,
    supabaseAccessToken: getSessionSupabaseAccessToken(session)
  };
};

const shouldAttemptProviderTokenRefresh = (userId: string, nowMs: number) => {
  if (!userId) return false;
  const lastAttemptAt = providerTokenRefreshAttemptAtByUserId.get(userId) ?? 0;
  return nowMs - lastAttemptAt >= GITHUB_PROVIDER_TOKEN_REFRESH_COOLDOWN_MS;
};

const refreshProviderTokenWithGitHub = async ({
  providerRefreshToken,
  supabaseAccessToken
}: {
  providerRefreshToken: string;
  supabaseAccessToken: string;
}): Promise<RefreshProviderTokenResponse | null> => {
  const response = await fetch("/.netlify/functions/github-refresh-provider-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`
    },
    body: JSON.stringify({
      provider_refresh_token: providerRefreshToken
    })
  });

  const payload = (await response.json().catch(() => ({}))) as RefreshProviderTokenResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not refresh GitHub token.");
  }

  const nextProviderToken = payload.provider_token?.trim() ?? "";
  if (!nextProviderToken) return null;
  return payload;
};

export const cacheGithubProviderCredentialsFromSession = (session: Session | null) => {
  const userId = getSessionUserId(session);
  if (!userId) return;

  const providerToken = getSessionProviderToken(session);
  const providerRefreshToken = getSessionProviderRefreshToken(session);

  if (providerToken) {
    writeStoredProviderToken(userId, providerToken);
  }
  if (providerRefreshToken) {
    writeStoredProviderRefreshToken(userId, providerRefreshToken);
  }
};

export const clearCachedGithubProviderCredentialsForUser = (userId: string) => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  providerTokenRefreshAttemptAtByUserId.delete(normalizedUserId);
  removeStoredProviderCredentials(normalizedUserId);
};

export const syncGithubAuthSnapshotFromSession = (session: Session | null) => {
  cacheGithubProviderCredentialsFromSession(session);
  inMemorySnapshot = createSnapshotFromSession(session);
  return inMemorySnapshot;
};

const getOrLoadSnapshot = async (): Promise<InternalGithubAuthSnapshot> => {
  if (inMemorySnapshot?.session) {
    return inMemorySnapshot;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  return syncGithubAuthSnapshotFromSession(data.session);
};

export const getFreshSupabaseAuthSnapshot = async (): Promise<FreshGithubAuthSnapshot> => {
  const snapshot = await getOrLoadSnapshot();
  return {
    session: snapshot.session,
    providerToken: snapshot.providerToken,
    supabaseAccessToken: snapshot.supabaseAccessToken
  };
};

export const getFreshGithubAuthSnapshot = async (): Promise<FreshGithubAuthSnapshot> => {
  let snapshot = await getOrLoadSnapshot();

  const userId = getSessionUserId(snapshot.session);
  const shouldTryRefresh =
    Boolean(snapshot.session) &&
    Boolean(snapshot.supabaseAccessToken) &&
    !snapshot.providerToken &&
    Boolean(snapshot.providerRefreshToken) &&
    shouldAttemptProviderTokenRefresh(userId, Date.now());

  if (shouldTryRefresh) {
    providerTokenRefreshAttemptAtByUserId.set(userId, Date.now());
    try {
      const refreshed = await refreshProviderTokenWithGitHub({
        providerRefreshToken: snapshot.providerRefreshToken,
        supabaseAccessToken: snapshot.supabaseAccessToken
      });

      const nextProviderToken = refreshed?.provider_token?.trim() ?? "";
      const nextProviderRefreshToken =
        refreshed?.provider_refresh_token?.trim() ?? snapshot.providerRefreshToken;

      if (nextProviderToken) {
        writeStoredProviderToken(userId, nextProviderToken);
        if (nextProviderRefreshToken) {
          writeStoredProviderRefreshToken(userId, nextProviderRefreshToken);
        }
        snapshot = {
          ...snapshot,
          providerToken: nextProviderToken,
          providerRefreshToken: nextProviderRefreshToken
        };
        inMemorySnapshot = snapshot;
      }
    } catch {
      // Keep current snapshot values when refresh fails.
    }
  }

  return {
    session: snapshot.session,
    providerToken: snapshot.providerToken,
    supabaseAccessToken: snapshot.supabaseAccessToken
  };
};

export const requireFreshGithubAuth = async (): Promise<FreshGithubAuth> => {
  const { session, providerToken, supabaseAccessToken } = await getFreshGithubAuthSnapshot();

  if (!session) {
    throw new Error("Sign in with GitHub to continue.");
  }

  if (!providerToken) {
    throw new Error("GitHub authorization missing. Reconnect GitHub from the header and retry.");
  }

  if (!supabaseAccessToken) {
    throw new Error("Supabase session missing. Please sign in again.");
  }

  return {
    session,
    providerToken,
    supabaseAccessToken
  };
};

export const requireFreshSupabaseAuth = async (): Promise<FreshSupabaseAuth> => {
  const { session, providerToken, supabaseAccessToken } = await getFreshSupabaseAuthSnapshot();

  if (!session) {
    throw new Error("Sign in with GitHub to continue.");
  }

  if (!supabaseAccessToken) {
    throw new Error("Supabase session missing. Please sign in again.");
  }

  return {
    session,
    providerToken,
    supabaseAccessToken
  };
};

export const connectGitHubAppForCurrentUser = async ({
  returnTo
}: {
  returnTo?: string;
} = {}) => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();
  const defaultReturnTo =
    typeof window === "undefined"
      ? "/studio"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const response = await fetch("/.netlify/functions/github-app-connect-start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`
    },
    body: JSON.stringify({
      return_to: returnTo?.trim() || defaultReturnTo
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not start GitHub App connection.");
  }

  const url = payload.url?.trim() ?? "";
  if (!url) {
    throw new Error("GitHub App connect URL is missing.");
  }

  if (typeof window !== "undefined") {
    window.location.assign(url);
  }
};
