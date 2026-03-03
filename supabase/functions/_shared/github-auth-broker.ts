import type { SupabaseClient } from "npm:@supabase/supabase-js@2.93.3";
import {
  decryptTokenValue,
  encryptTokenValue,
  getTokenEncryptionVersion
} from "./github-token-crypto.ts";

const GITHUB_APP_CLIENT_ID = Deno.env.get("GITHUB_APP_CLIENT_ID") ?? "";
const GITHUB_APP_CLIENT_SECRET = Deno.env.get("GITHUB_APP_CLIENT_SECRET") ?? "";
const GITHUB_OAUTH_CLIENT_ID = Deno.env.get("GITHUB_OAUTH_CLIENT_ID") ?? "";
const GITHUB_OAUTH_CLIENT_SECRET = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") ?? "";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";
const TOKEN_EXPIRY_SKEW_SECONDS = 90;
const GITHUB_TOKEN_DEBUG = /^(1|true|yes|on)$/i.test(Deno.env.get("GITHUB_TOKEN_DEBUG") ?? "");

const normalizeGitHubToken = (value: string | null | undefined): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const withoutBearerPrefix = trimmed.replace(/^Bearer\s+/i, "");
  const normalizedWhitespace = withoutBearerPrefix.replace(/[\s\r\n\t]+/g, "");
  if (!normalizedWhitespace) return "";
  // Prevent invalid header values (control chars, spaces, non-ASCII) from reaching fetch().
  return /^[\x21-\x7E]+$/.test(normalizedWhitespace) ? normalizedWhitespace : "";
};

const debugLog = (message: string, details: Record<string, unknown>) => {
  if (!GITHUB_TOKEN_DEBUG) return;
  console.log("[github-auth-broker]", message, details);
};

type GitHubTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

type GitHubOAuthCredentialSource = "github_app" | "legacy_oauth";
export type GitHubAuthMode = "solidary" | "github";

type StoredCredentialRow = {
  user_id: string;
  auth_mode: GitHubAuthMode | null;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  refresh_token_encrypted: string | null;
  refresh_token_expires_at: string | null;
  token_encryption_key_version: string | null;
  token_type: string | null;
  scope: string | null;
  github_user_id: number | null;
  github_login: string | null;
  installation_id: number | null;
  installation_account_login: string | null;
  installation_account_type: string | null;
};

export type GitHubTokenSource = GitHubAuthMode;

export type ResolvedGitHubToken = {
  token: string;
  source: GitHubTokenSource;
};

export type GitHubAppConnectionState =
  | "connected"
  | "installation_missing"
  | "token_invalid"
  | "unknown"
  | "not_connected";

export type GitHubAppConnectionCheckResult = {
  connected: boolean;
  state: GitHubAppConnectionState;
  message: string | null;
};

export type GitHubAppTokenExchange = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
};

export type UpsertGitHubAppUserCredentialsInput = {
  userId: string;
  authMode?: GitHubAuthMode;
  githubUserId?: number | null;
  githubLogin?: string | null;
  installationId?: number | null;
  installationAccountLogin?: string | null;
  installationAccountType?: string | null;
  accessToken: string;
  accessTokenExpiresAt?: string | null;
  refreshToken?: string | null;
  refreshTokenExpiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  source?: string;
};

const normalizePositiveInt = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
};

const computeExpiresAt = (seconds: unknown): string | null => {
  const normalized = normalizePositiveInt(seconds);
  if (!normalized) return null;
  return new Date(Date.now() + normalized * 1000).toISOString();
};

const parseDateToMs = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeGitHubAuthMode = (value: unknown): GitHubAuthMode => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "github" ? "github" : "solidary";
};

const normalizeInstallationId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
};

const isTokenStillUsable = (expiresAt: string | null | undefined): boolean => {
  if (!expiresAt) return true;
  const expiresAtMs = parseDateToMs(expiresAt);
  if (!expiresAtMs) return false;
  const nowMs = Date.now();
  return expiresAtMs - nowMs > TOKEN_EXPIRY_SKEW_SECONDS * 1000;
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const getGitHubApiMessage = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" ? message.trim() : "";
};

const parseGitHubTokenPayload = (payload: GitHubTokenPayload): GitHubAppTokenExchange => {
  const accessToken = payload.access_token?.trim() ?? "";
  if (!accessToken) {
    const description = payload.error_description?.trim() ?? payload.error?.trim() ?? "";
    throw new Error(description || "GitHub did not return an access token.");
  }

  return {
    accessToken,
    refreshToken: payload.refresh_token?.trim() ?? "",
    tokenType: payload.token_type?.trim() ?? "bearer",
    scope: payload.scope?.trim() ?? "",
    accessTokenExpiresAt: computeExpiresAt(payload.expires_in),
    refreshTokenExpiresAt: computeExpiresAt(payload.refresh_token_expires_in)
  };
};

const getGitHubOAuthClientCredentials = (source: GitHubOAuthCredentialSource) => {
  if (source === "github_app") {
    return {
      clientId: GITHUB_APP_CLIENT_ID.trim(),
      clientSecret: GITHUB_APP_CLIENT_SECRET.trim()
    };
  }
  return {
    clientId: GITHUB_OAUTH_CLIENT_ID.trim(),
    clientSecret: GITHUB_OAUTH_CLIENT_SECRET.trim()
  };
};

const postGitHubTokenExchange = async ({
  params,
  source
}: {
  params: URLSearchParams;
  source: GitHubOAuthCredentialSource;
}): Promise<GitHubAppTokenExchange> => {
  const { clientId, clientSecret } = getGitHubOAuthClientCredentials(source);
  if (!clientId || !clientSecret) {
    throw new Error(
      source === "github_app"
        ? "Missing GitHub App connect credentials (GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET)."
        : "Missing GitHub OAuth credentials (GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET)."
    );
  }

  const response = await fetch(GITHUB_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = (await response.json().catch(() => ({}))) as GitHubTokenPayload;
  debugLog("GitHub token exchange response", {
    status: response.status,
    payload
  });
  if (!response.ok) {
    const description = payload.error_description?.trim() || payload.error?.trim();
    throw new Error(description || `GitHub token exchange failed (${response.status}).`);
  }
  return parseGitHubTokenPayload(payload);
};

export const exchangeCodeForGitHubAppUserToken = async (code: string): Promise<GitHubAppTokenExchange> => {
  const { clientId, clientSecret } = getGitHubOAuthClientCredentials("github_app");
  return postGitHubTokenExchange({
    source: "github_app",
    params: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      access_type: "offline"
    })
  });
};

export const refreshGitHubAppUserToken = async (
  refreshToken: string,
  source: GitHubOAuthCredentialSource
): Promise<GitHubAppTokenExchange> => {
  const { clientId, clientSecret } = getGitHubOAuthClientCredentials(source);
  return postGitHubTokenExchange({
    source,
    params: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
};

export const upsertGitHubAppUserCredentials = async ({
  supabase,
  input
}: {
  supabase: SupabaseClient;
  input: UpsertGitHubAppUserCredentialsInput;
}) => {
  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("Cannot store GitHub App credentials without a user id.");
  }
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("Cannot store empty GitHub App access token.");
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    access_token_encrypted: encryptTokenValue(accessToken),
    token_encryption_key_version: getTokenEncryptionVersion(),
    connected_at: new Date().toISOString()
  };

  if (typeof input.authMode !== "undefined") {
    payload.auth_mode = normalizeGitHubAuthMode(input.authMode);
  }

  if (typeof input.accessTokenExpiresAt !== "undefined") {
    payload.access_token_expires_at = input.accessTokenExpiresAt;
  }

  if (typeof input.githubUserId !== "undefined") {
    payload.github_user_id = input.githubUserId;
  }

  if (typeof input.githubLogin !== "undefined") {
    payload.github_login = input.githubLogin?.trim() || null;
  }

  if (typeof input.installationId !== "undefined") {
    payload.installation_id = input.installationId;
  }

  if (typeof input.installationAccountLogin !== "undefined") {
    payload.installation_account_login = input.installationAccountLogin?.trim() || null;
  }

  if (typeof input.installationAccountType !== "undefined") {
    payload.installation_account_type = input.installationAccountType?.trim() || null;
  }

  if (typeof input.refreshToken !== "undefined") {
    payload.refresh_token_encrypted = input.refreshToken?.trim()
      ? encryptTokenValue(input.refreshToken)
      : null;
  }

  if (typeof input.refreshTokenExpiresAt !== "undefined") {
    payload.refresh_token_expires_at = input.refreshTokenExpiresAt;
  }

  if (typeof input.tokenType !== "undefined") {
    payload.token_type = input.tokenType?.trim() || null;
  }

  if (typeof input.scope !== "undefined") {
    payload.scope = input.scope?.trim() || null;
  }

  debugLog("upserting credentials", {
    userId,
    source: input.source ?? "unknown",
    authMode: input.authMode ?? null,
    accessToken: input.accessToken,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    refreshToken: input.refreshToken,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    tokenType: input.tokenType,
    scope: input.scope,
    githubUserId: input.githubUserId,
    githubLogin: input.githubLogin,
    installationId: input.installationId,
    installationAccountLogin: input.installationAccountLogin,
    installationAccountType: input.installationAccountType
  });

  const { error } = await supabase.from("github_app_user_tokens").upsert(payload, {
    onConflict: "user_id"
  });
  if (error) {
    throw new Error(error.message);
  }
};

const getStoredCredential = async ({
  supabase,
  userId
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<StoredCredentialRow | null> => {
  const { data, error } = await supabase
    .from("github_app_user_tokens")
    .select(
      [
        "user_id",
        "auth_mode",
        "access_token_encrypted",
        "access_token_expires_at",
        "refresh_token_encrypted",
        "refresh_token_expires_at",
        "token_encryption_key_version",
        "token_type",
        "scope",
        "github_user_id",
        "github_login",
        "installation_id",
        "installation_account_login",
        "installation_account_type"
      ].join(", ")
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object" || Array.isArray(data) || "error" in data) {
    return null;
  }

  return data as StoredCredentialRow;
};

export const resolveGitHubTokenForUser = async ({
  supabase,
  userId
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ResolvedGitHubToken | null> => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const credential = await getStoredCredential({
    supabase,
    userId: normalizedUserId
  });

  if (credential) {
    const authMode = normalizeGitHubAuthMode(credential.auth_mode);
    const rawStoredAccessToken = credential.access_token_encrypted?.trim()
      ? decryptTokenValue(credential.access_token_encrypted)
      : "";
    const rawStoredRefreshToken = credential.refresh_token_encrypted?.trim()
      ? decryptTokenValue(credential.refresh_token_encrypted)
      : "";
    const storedAccessToken = normalizeGitHubToken(rawStoredAccessToken);
    const storedRefreshToken = normalizeGitHubToken(rawStoredRefreshToken);

    debugLog("resolved stored credential", {
      userId: normalizedUserId,
      hasAccessToken: Boolean(rawStoredAccessToken),
      hasRefreshToken: Boolean(rawStoredRefreshToken),
      hasHeaderSafeAccessToken: Boolean(storedAccessToken),
      hasHeaderSafeRefreshToken: Boolean(storedRefreshToken),
      authMode,
      accessTokenExpiresAt: credential.access_token_expires_at,
      refreshTokenExpiresAt: credential.refresh_token_expires_at
    });

    // If we do not have a refresh token, allow best-effort use of the stored access token
    // even when local expiry metadata looks stale. Downstream GitHub API calls remain the
    // source of truth and will return 401/403 when the token is actually unusable.
    const canUseStoredAccessToken =
      Boolean(storedAccessToken) &&
      (isTokenStillUsable(credential.access_token_expires_at) || !storedRefreshToken);

    if (canUseStoredAccessToken) {
      return { token: storedAccessToken, source: authMode };
    }

    if (storedRefreshToken) {
      const refreshSource: GitHubOAuthCredentialSource =
        authMode === "github" ? "github_app" : "legacy_oauth";
      try {
        const refreshed = await refreshGitHubAppUserToken(storedRefreshToken, refreshSource);
        await upsertGitHubAppUserCredentials({
          supabase,
          input: {
            userId: normalizedUserId,
            authMode,
            githubUserId: credential.github_user_id,
            githubLogin: credential.github_login,
            installationId: credential.installation_id,
            installationAccountLogin: credential.installation_account_login,
            installationAccountType: credential.installation_account_type,
            accessToken: refreshed.accessToken,
            accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
            refreshToken: refreshed.refreshToken || storedRefreshToken,
            refreshTokenExpiresAt:
              refreshed.refreshTokenExpiresAt ?? credential.refresh_token_expires_at ?? null,
            tokenType: refreshed.tokenType,
            scope: refreshed.scope,
            source: `refresh_flow:${refreshSource}`
          }
        });
        const refreshedAccessToken = normalizeGitHubToken(refreshed.accessToken);
        if (!refreshedAccessToken) {
          debugLog("discarding refreshed token with invalid header characters", {
            userId: normalizedUserId,
            authMode,
            refreshSource
          });
          return null;
        }
        return {
          token: refreshedAccessToken,
          source: authMode
        };
      } catch (error) {
        debugLog("refresh flow failed", {
          userId: normalizedUserId,
          authMode,
          refreshSource,
          message: error instanceof Error ? error.message : "unknown error"
        });
      }
    }
  }

  return null;
};

export const getGitHubAppConnectionStatusForUser = async ({
  supabase,
  userId
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<GitHubAppConnectionCheckResult> => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return {
      connected: false,
      state: "not_connected",
      message: null
    };
  }

  const credential = await getStoredCredential({
    supabase,
    userId: normalizedUserId
  });
  const authMode = normalizeGitHubAuthMode(credential?.auth_mode ?? null);
  if (!credential || authMode !== "github") {
    return {
      connected: false,
      state: "not_connected",
      message: null
    };
  }

  const resolved = await resolveGitHubTokenForUser({
    supabase,
    userId: normalizedUserId
  });
  const token = resolved?.token?.trim() ?? "";
  if (!token) {
    return {
      connected: false,
      state: "token_invalid",
      message:
        "GitHub App authorization is invalid or expired. Reconnect GitHub App, or uninstall it and switch to Solidary OAuth from Profile."
    };
  }
  if (resolved?.source !== "github") {
    debugLog("GitHub App connection check resolved non-github source", {
      userId: normalizedUserId,
      source: resolved?.source ?? null
    });
  }

  const installationId = normalizeInstallationId(credential.installation_id);

  try {
    if (installationId) {
      const installationResponse = await fetch(
        `${GITHUB_API}/user/installations/${encodeURIComponent(String(installationId))}`,
        {
          headers: githubHeaders(token)
        }
      );
      const installationPayload = await installationResponse.json().catch(() => ({}));

      if (installationResponse.ok) {
        return {
          connected: true,
          state: "connected",
          message: null
        };
      }

      if (installationResponse.status === 404) {
        return {
          connected: false,
          state: "installation_missing",
          message:
            getGitHubApiMessage(installationPayload) ||
            "GitHub App is no longer installed or no longer granted to your repositories. Grant access in GitHub App settings, or uninstall it and switch to Solidary OAuth from Profile."
        };
      }

      if (installationResponse.status === 401 || installationResponse.status === 403) {
        return {
          connected: false,
          state: "token_invalid",
          message:
            getGitHubApiMessage(installationPayload) ||
            "GitHub App authorization is invalid or expired. Reconnect GitHub App, or uninstall it and switch to Solidary OAuth from Profile."
        };
      }

      return {
        connected: false,
        state: "unknown",
        message:
          getGitHubApiMessage(installationPayload) ||
          `Could not verify GitHub App installation (${installationResponse.status}).`
      };
    }

    const installationsResponse = await fetch(`${GITHUB_API}/user/installations?per_page=1`, {
      headers: githubHeaders(token)
    });
    const installationsPayload = (await installationsResponse
      .json()
      .catch(() => ({}))) as {
      total_count?: unknown;
      installations?: unknown[];
      message?: unknown;
    };

    if (installationsResponse.ok) {
      const totalCountRaw = installationsPayload.total_count;
      const installationCount =
        typeof totalCountRaw === "number" && Number.isFinite(totalCountRaw)
          ? totalCountRaw
          : Array.isArray(installationsPayload.installations)
            ? installationsPayload.installations.length
            : 0;

      if (installationCount > 0) {
        return {
          connected: true,
          state: "connected",
          message: null
        };
      }

      return {
        connected: false,
        state: "installation_missing",
        message:
          "GitHub App is not installed for this account. Install or reconnect the GitHub App, or uninstall it and switch to Solidary OAuth from Profile."
      };
    }

    if (installationsResponse.status === 401 || installationsResponse.status === 403) {
      return {
        connected: false,
        state: "token_invalid",
        message:
          getGitHubApiMessage(installationsPayload) ||
          "GitHub App authorization is invalid or expired. Reconnect GitHub App, or uninstall it and switch to Solidary OAuth from Profile."
      };
    }

    return {
      connected: false,
      state: "unknown",
      message:
        getGitHubApiMessage(installationsPayload) ||
        `Could not verify GitHub App installation (${installationsResponse.status}).`
    };
  } catch (error) {
    debugLog("GitHub App connection check failed", {
      userId: normalizedUserId,
      message: error instanceof Error ? error.message : "unknown error"
    });
    return {
      connected: false,
      state: "unknown",
      message: "Could not verify GitHub App installation right now. Please retry."
    };
  }
};
