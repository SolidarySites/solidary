import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";

type SessionWithProviderCredentials = Session & {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

const GITHUB_PROVIDER_TOKEN_STORAGE_PREFIX = "solidary:github-provider-token:";
const GITHUB_PROVIDER_REFRESH_TOKEN_STORAGE_PREFIX = "solidary:github-provider-refresh-token:";
const GITHUB_PROVIDER_ACCESS_TOKEN_EXPIRES_AT_STORAGE_PREFIX = "solidary:github-provider-access-token-expires-at:";
const GITHUB_PROVIDER_REFRESH_TOKEN_EXPIRES_AT_STORAGE_PREFIX = "solidary:github-provider-refresh-token-expires-at:";
const GITHUB_PROVIDER_TOKEN_REFRESH_COOLDOWN_MS = 60 * 1000;
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(
  String(import.meta.env.VITE_GITHUB_TOKEN_DEBUG ?? "")
);

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

export type ConnectGitHubAppResult = {
  connected: boolean;
  redirected: boolean;
};

type InternalGithubAuthSnapshot = FreshGithubAuthSnapshot & {
  providerRefreshToken: string;
  providerAccessTokenExpiresAt: string;
  providerRefreshTokenExpiresAt: string;
};

type RefreshProviderTokenResponse = {
  provider_token?: string;
  provider_refresh_token?: string;
  access_token_expires_at?: string;
  refresh_token_expires_at?: string;
};

type SyncProviderTokenOptions = {
  trigger?: string;
};

const providerTokenRefreshAttemptAtByUserId = new Map<string, number>();
const providerTokenSyncFingerprintByUserId = new Map<string, string>();
let inMemorySnapshot: InternalGithubAuthSnapshot | null = null;

const debugLog = (message: string, details: Record<string, unknown>) => {
  if (!GITHUB_TOKEN_DEBUG) return;
  console.log("[github-auth]", message, details);
};

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

const getGithubProviderAccessTokenExpiresAtStorageKey = (userId: string) =>
  `${GITHUB_PROVIDER_ACCESS_TOKEN_EXPIRES_AT_STORAGE_PREFIX}${userId}`;

const getGithubProviderRefreshTokenExpiresAtStorageKey = (userId: string) =>
  `${GITHUB_PROVIDER_REFRESH_TOKEN_EXPIRES_AT_STORAGE_PREFIX}${userId}`;

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

const writeStoredProviderAccessTokenExpiresAt = (userId: string, expiresAt: string) => {
  writeStorageValue(getGithubProviderAccessTokenExpiresAtStorageKey(userId), expiresAt);
};

const readStoredProviderAccessTokenExpiresAt = (userId: string): string => {
  return readStorageValue(getGithubProviderAccessTokenExpiresAtStorageKey(userId));
};

const writeStoredProviderRefreshTokenExpiresAt = (userId: string, expiresAt: string) => {
  writeStorageValue(getGithubProviderRefreshTokenExpiresAtStorageKey(userId), expiresAt);
};

const readStoredProviderRefreshTokenExpiresAt = (userId: string): string => {
  return readStorageValue(getGithubProviderRefreshTokenExpiresAtStorageKey(userId));
};

const removeStoredProviderCredentials = (userId: string) => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  writeStoredProviderToken(normalizedUserId, "");
  writeStoredProviderRefreshToken(normalizedUserId, "");
  writeStoredProviderAccessTokenExpiresAt(normalizedUserId, "");
  writeStoredProviderRefreshTokenExpiresAt(normalizedUserId, "");
};

const createSnapshotFromSession = (session: Session | null): InternalGithubAuthSnapshot => {
  const userId = getSessionUserId(session);
  const sessionProviderToken = getSessionProviderToken(session);
  const sessionProviderRefreshToken = getSessionProviderRefreshToken(session);
  const storedProviderToken = userId ? readStoredProviderToken(userId) : "";
  const storedProviderRefreshToken = userId ? readStoredProviderRefreshToken(userId) : "";
  const storedAccessTokenExpiresAt = userId ? readStoredProviderAccessTokenExpiresAt(userId) : "";
  const storedRefreshTokenExpiresAt = userId ? readStoredProviderRefreshTokenExpiresAt(userId) : "";

  return {
    session,
    providerToken: sessionProviderToken || storedProviderToken,
    providerRefreshToken: sessionProviderRefreshToken || storedProviderRefreshToken,
    providerAccessTokenExpiresAt: storedAccessTokenExpiresAt,
    providerRefreshTokenExpiresAt: storedRefreshTokenExpiresAt,
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
  providerTokenSyncFingerprintByUserId.delete(normalizedUserId);
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
      const nextAccessTokenExpiresAt = refreshed?.access_token_expires_at?.trim() ?? "";
      const nextRefreshTokenExpiresAt = refreshed?.refresh_token_expires_at?.trim() ?? "";

      if (nextProviderToken) {
        writeStoredProviderToken(userId, nextProviderToken);
        if (nextProviderRefreshToken) {
          writeStoredProviderRefreshToken(userId, nextProviderRefreshToken);
        }
        if (nextAccessTokenExpiresAt) {
          writeStoredProviderAccessTokenExpiresAt(userId, nextAccessTokenExpiresAt);
        }
        if (nextRefreshTokenExpiresAt) {
          writeStoredProviderRefreshTokenExpiresAt(userId, nextRefreshTokenExpiresAt);
        }

        snapshot = {
          ...snapshot,
          providerToken: nextProviderToken,
          providerRefreshToken: nextProviderRefreshToken,
          providerAccessTokenExpiresAt: nextAccessTokenExpiresAt || snapshot.providerAccessTokenExpiresAt,
          providerRefreshTokenExpiresAt: nextRefreshTokenExpiresAt || snapshot.providerRefreshTokenExpiresAt
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

  if (!supabaseAccessToken) {
    throw new Error("Supabase session missing. Please sign in again.");
  }

  if (!providerToken) {
    debugLog("proceeding without client provider token", {
      userId: getSessionUserId(session),
      reason: "will_rely_on_server_side_token_resolution"
    });
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
  returnTo,
  force = false
}: {
  returnTo?: string;
  force?: boolean;
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
      return_to: returnTo?.trim() || defaultReturnTo,
      force
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    connected?: boolean;
    url?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not start GitHub App connection.");
  }

  if (payload.connected) {
    return {
      connected: true,
      redirected: false
    } satisfies ConnectGitHubAppResult;
  }

  const url = payload.url?.trim() ?? "";
  if (!url) {
    throw new Error("GitHub App connect URL is missing.");
  }

  if (typeof window !== "undefined") {
    window.location.assign(url);
  }

  return {
    connected: false,
    redirected: true
  } satisfies ConnectGitHubAppResult;
};

export const syncGithubProviderTokenToServer = async (
  session: Session | null,
  options: SyncProviderTokenOptions = {}
) => {
  const trigger = options.trigger?.trim() || "unknown";
  const userId = getSessionUserId(session);
  if (!userId) {
    debugLog("skipping provider token sync", {
      trigger,
      reason: "missing_user_id"
    });
    return;
  }

  const supabaseAccessToken = getSessionSupabaseAccessToken(session);
  if (!supabaseAccessToken) {
    debugLog("skipping provider token sync", {
      userId,
      trigger,
      reason: "missing_supabase_access_token"
    });
    return;
  }

  const snapshot = inMemorySnapshot || createSnapshotFromSession(session);
  const providerToken = snapshot.providerToken;
  if (!providerToken) {
    debugLog("skipping provider token sync", {
      userId,
      trigger,
      reason: "missing_provider_token"
    });
    return;
  }

  const providerRefreshToken = snapshot.providerRefreshToken;
  const providerAccessTokenExpiresAt = snapshot.providerAccessTokenExpiresAt;
  const providerRefreshTokenExpiresAt = snapshot.providerRefreshTokenExpiresAt;

  const fingerprint = `${providerToken}|${providerRefreshToken}|${providerAccessTokenExpiresAt}|${providerRefreshTokenExpiresAt}`;
  if (providerTokenSyncFingerprintByUserId.get(userId) === fingerprint) {
    debugLog("skipping provider token sync", {
      userId,
      trigger,
      reason: "duplicate_fingerprint"
    });
    return;
  }

  debugLog("syncing provider token to server", {
    userId,
    trigger,
    hasEffectiveProviderRefreshToken: Boolean(providerRefreshToken),
    hasEffectiveProviderAccessTokenExpiresAt: Boolean(providerAccessTokenExpiresAt),
    hasEffectiveProviderRefreshTokenExpiresAt: Boolean(providerRefreshTokenExpiresAt)
  });

  providerTokenSyncFingerprintByUserId.set(userId, fingerprint);
  try {
    const response = await fetch("/.netlify/functions/github-store-provider-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${supabaseAccessToken}`
      },
      body: JSON.stringify({
        provider_token: providerToken,
        provider_refresh_token: providerRefreshToken || undefined,
        provider_access_token_expires_at: providerAccessTokenExpiresAt || undefined,
        provider_refresh_token_expires_at: providerRefreshTokenExpiresAt || undefined,
        debug_trigger: trigger,
        session_has_provider_token: Boolean(getSessionProviderToken(session)),
        session_has_provider_refresh_token: Boolean(getSessionProviderRefreshToken(session))
      })
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      debug?: Record<string, unknown>;
    };

    debugLog("provider token sync response", {
      userId,
      trigger,
      status: response.status,
      ok: response.ok,
      debug: payload.debug ?? null,
      error: payload.error ?? null
    });

    if (!response.ok) {
      providerTokenSyncFingerprintByUserId.delete(userId);
    }
  } catch {
    providerTokenSyncFingerprintByUserId.delete(userId);
  }
};
