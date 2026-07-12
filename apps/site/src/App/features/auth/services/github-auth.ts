import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseFunctionUrl } from "../../../lib/supabase";

type SessionWithProviderCredentials = Session & {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(
  String(import.meta.env.VITE_GITHUB_TOKEN_DEBUG ?? "")
);

export const GITHUB_OAUTH_SCOPES = "repo delete_repo workflow";

export type GitHubAppConnectionState =
  | "connected"
  | "installation_missing"
  | "token_invalid"
  | "unknown"
  | "not_connected";

export type GitHubAppRepositorySelection = "all" | "selected" | "unknown";
export type GitHubAuthRoutingStrategy = "role_based" | "unknown";

export type GitHubAuthStatus = {
  githubAppConnected: boolean;
  hasStoredCredentials: boolean;
  hasGitHubCredentials: boolean;
  hasSolidaryCredentials: boolean;
  authRoutingStrategy: GitHubAuthRoutingStrategy;
  githubAppConnectionState: GitHubAppConnectionState;
  githubAppConnectionMessage: string | null;
  githubAppRepositorySelection: GitHubAppRepositorySelection;
  githubAppSelectedRepositories: string[];
  githubAppSelectedRepositoriesTruncated: boolean;
};

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

export type ConnectGitHubAppOpenMode = "same_tab" | "new_tab" | "popup";

export type ConnectGitHubAppRequest = {
  returnTo?: string;
  force?: boolean;
  openMode?: ConnectGitHubAppOpenMode;
  navigationWindow?: Window | null;
};

export type GitHubAppConnectResultStatus = "connected" | "error";

export const GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE =
  "solidary:github-app-connect-result";

type InternalGithubAuthSnapshot = FreshGithubAuthSnapshot & {
  providerRefreshToken: string;
};

type SyncProviderTokenOptions = {
  trigger?: string;
};

const providerTokenSyncFingerprintByUserId = new Map<string, string>();
let inMemorySnapshot: InternalGithubAuthSnapshot | null = null;

const debugLog = (message: string, details: Record<string, unknown>) => {
  if (!GITHUB_TOKEN_DEBUG) return;
  console.log("[github-auth]", message, details);
};

const normalizeGitHubProviderToken = (value: string | null | undefined) =>
  (value ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/[\s\r\n\t]+/g, "");

export const parseGitHubAppConnectResultStatus = (
  value: string
): GitHubAppConnectResultStatus => (value === "connected" ? "connected" : "error");

export const parseGitHubAppConnectResultMessagePayload = (
  value: unknown
): { status: GitHubAppConnectResultStatus; message: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const type = (value as { type?: unknown }).type;
  if (type !== GITHUB_APP_CONNECT_RESULT_MESSAGE_TYPE) {
    return null;
  }

  const rawStatus = (value as { status?: unknown }).status;
  if (typeof rawStatus !== "string") {
    return null;
  }

  return {
    status: parseGitHubAppConnectResultStatus(rawStatus.trim()),
    message: typeof (value as { message?: unknown }).message === "string"
      ? ((value as { message?: string }).message?.trim() ?? "")
      : ""
  };
};

export const parseGitHubAppConnectResultFromSearch = (
  search: string
): { status: GitHubAppConnectResultStatus; message: string } | null => {
  const params = new URLSearchParams(search);
  const rawStatus = params.get("github_app")?.trim() ?? "";
  if (!rawStatus) {
    return null;
  }

  return {
    status: parseGitHubAppConnectResultStatus(rawStatus),
    message: params.get("github_app_message")?.trim() ?? ""
  };
};

const getSessionProviderToken = (session: Session | null): string => {
  if (!session) return "";
  return normalizeGitHubProviderToken((session as SessionWithProviderCredentials).provider_token ?? "");
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

const createSnapshotFromSession = (session: Session | null): InternalGithubAuthSnapshot => {
  return {
    session,
    providerToken: getSessionProviderToken(session),
    providerRefreshToken: getSessionProviderRefreshToken(session),
    supabaseAccessToken: getSessionSupabaseAccessToken(session)
  };
};

export const cacheGithubProviderCredentialsFromSession = (session: Session | null) => {
  void session;
  // Intentionally no-op: client-side credential caching is disabled.
};

export const clearCachedGithubProviderCredentialsForUser = (userId: string) => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  providerTokenSyncFingerprintByUserId.delete(normalizedUserId);
};

export const syncGithubAuthSnapshotFromSession = (session: Session | null) => {
  cacheGithubProviderCredentialsFromSession(session);
  inMemorySnapshot = createSnapshotFromSession(session);
  return inMemorySnapshot;
};

const isSessionFresh = (session: Session | null) => {
  if (!session) return false;
  const expiresAtMs = typeof session.expires_at === "number" ? session.expires_at * 1000 : 0;
  return expiresAtMs > Date.now() + 60_000;
};

const getOrLoadSnapshot = async (): Promise<InternalGithubAuthSnapshot> => {
  if (inMemorySnapshot?.session && isSessionFresh(inMemorySnapshot.session)) {
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
  const snapshot = await getOrLoadSnapshot();

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


const normalizeTrustedHttpsUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

const navigateToGitHubAppConnectUrl = ({
  url,
  openMode,
  navigationWindow
}: {
  url: string;
  openMode: ConnectGitHubAppOpenMode;
  navigationWindow?: Window | null;
}) => {
  if (typeof window === "undefined") {
    return;
  }

  if (openMode === "popup") {
    const popupWindow = navigationWindow;
    if (popupWindow && !popupWindow.closed) {
      try {
        popupWindow.location.assign(url);
        popupWindow.focus();
        return;
      } catch {
        // Fall through to current-tab navigation when popup cannot be controlled.
      }
    }
  }

  if (openMode === "new_tab") {
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      return;
    }
  }

  window.location.assign(url);
};

export const connectGitHubAppForCurrentUser = async ({
  returnTo,
  force = false,
  openMode = "same_tab",
  navigationWindow
}: ConnectGitHubAppRequest = {}) => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();
  const defaultReturnTo =
    typeof window === "undefined"
      ? "/studio"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const response = await fetch(supabaseFunctionUrl("github-app-connect-start"), {
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

  const url = normalizeTrustedHttpsUrl(payload.url?.trim() ?? "");
  if (!url) {
    throw new Error("GitHub App connect URL is missing or invalid.");
  }

  navigateToGitHubAppConnectUrl({
    url,
    openMode,
    navigationWindow
  });

  return {
    connected: false,
    redirected: true
  } satisfies ConnectGitHubAppResult;
};

export const uninstallGitHubAppForCurrentUser = async () => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();

  const response = await fetch(supabaseFunctionUrl("github-app-uninstall"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`
    }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not uninstall GitHub App.");
  }
};

const normalizeGitHubAppConnectionState = (value: unknown): GitHubAppConnectionState => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    normalized === "connected" ||
    normalized === "installation_missing" ||
    normalized === "token_invalid" ||
    normalized === "unknown" ||
    normalized === "not_connected"
  ) {
    return normalized;
  }
  return "unknown";
};

const normalizeAuthRoutingStrategy = (value: unknown): GitHubAuthRoutingStrategy => {
  return value === "role_based" ? "role_based" : "unknown";
};

const normalizeGitHubAppRepositorySelection = (value: unknown): GitHubAppRepositorySelection => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "all" || normalized === "selected") {
    return normalized;
  }
  return "unknown";
};

const normalizeRepositoryNameList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry): entry is string => Boolean(entry));
};

export const getGitHubAuthStatusForCurrentUser = async (): Promise<GitHubAuthStatus> => {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();

  const response = await fetch(supabaseFunctionUrl("github-auth-status"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`
    }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    github_app_connected?: boolean;
    has_stored_credentials?: boolean;
    has_github_credentials?: boolean;
    has_solidary_credentials?: boolean;
    auth_routing_strategy?: string;
    github_app_connection_state?: string;
    github_app_connection_message?: string | null;
    github_app_repository_selection?: string;
    github_app_selected_repositories?: unknown[];
    github_app_selected_repositories_truncated?: boolean;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not read GitHub auth status.");
  }

  return {
    githubAppConnected: Boolean(payload.github_app_connected),
    hasStoredCredentials: Boolean(payload.has_stored_credentials),
    hasGitHubCredentials: Boolean(payload.has_github_credentials),
    hasSolidaryCredentials: Boolean(payload.has_solidary_credentials),
    authRoutingStrategy: normalizeAuthRoutingStrategy(payload.auth_routing_strategy),
    githubAppConnectionState: normalizeGitHubAppConnectionState(payload.github_app_connection_state),
    githubAppConnectionMessage:
      typeof payload.github_app_connection_message === "string"
        ? payload.github_app_connection_message
        : null,
    githubAppRepositorySelection: normalizeGitHubAppRepositorySelection(
      payload.github_app_repository_selection
    ),
    githubAppSelectedRepositories: normalizeRepositoryNameList(
      payload.github_app_selected_repositories
    ),
    githubAppSelectedRepositoriesTruncated: Boolean(
      payload.github_app_selected_repositories_truncated
    )
  };
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

  const providerToken = getSessionProviderToken(session);
  if (!providerToken) {
    debugLog("skipping provider token sync", {
      userId,
      trigger,
      reason: "missing_provider_token"
    });
    return;
  }

  const providerRefreshToken = getSessionProviderRefreshToken(session);
  const fingerprint = `${providerToken}|${providerRefreshToken}`;
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
    hasSessionProviderToken: true,
    hasSessionProviderRefreshToken: Boolean(providerRefreshToken)
  });

  providerTokenSyncFingerprintByUserId.set(userId, fingerprint);
  try {
    const response = await fetch(supabaseFunctionUrl("github-store-provider-token"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${supabaseAccessToken}`
      },
      body: JSON.stringify({
        provider_token: providerToken,
        provider_refresh_token: providerRefreshToken || undefined,
        debug_trigger: trigger,
        session_has_provider_token: true,
        session_has_provider_refresh_token: Boolean(providerRefreshToken)
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
