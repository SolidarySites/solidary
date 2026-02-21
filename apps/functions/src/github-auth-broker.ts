import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptTokenValue,
  encryptTokenValue,
  getTokenEncryptionVersion
} from "./github-token-crypto";

const GITHUB_OAUTH_CLIENT_ID =
  process.env.GITHUB_APP_CLIENT_ID ?? process.env.GITHUB_OAUTH_CLIENT_ID ?? "";
const GITHUB_OAUTH_CLIENT_SECRET =
  process.env.GITHUB_APP_CLIENT_SECRET ?? process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const TOKEN_EXPIRY_SKEW_SECONDS = 90;

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

type StoredCredentialRow = {
  user_id: string;
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

export type GitHubTokenSource = "github_app" | "legacy_oauth";

export type ResolvedGitHubToken = {
  token: string;
  source: GitHubTokenSource;
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

const isTokenStillUsable = (expiresAt: string | null | undefined): boolean => {
  if (!expiresAt) return true;
  const expiresAtMs = parseDateToMs(expiresAt);
  if (!expiresAtMs) return false;
  const nowMs = Date.now();
  return expiresAtMs - nowMs > TOKEN_EXPIRY_SKEW_SECONDS * 1000;
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

const postGitHubTokenExchange = async (params: URLSearchParams): Promise<GitHubAppTokenExchange> => {
  if (!GITHUB_OAUTH_CLIENT_ID || !GITHUB_OAUTH_CLIENT_SECRET) {
    throw new Error(
      "Missing GitHub client credentials (set GITHUB_APP_CLIENT_ID/GITHUB_APP_CLIENT_SECRET or legacy GITHUB_OAUTH_CLIENT_ID/GITHUB_OAUTH_CLIENT_SECRET)."
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
  if (!response.ok) {
    const description = payload.error_description?.trim() || payload.error?.trim();
    throw new Error(description || `GitHub token exchange failed (${response.status}).`);
  }
  return parseGitHubTokenPayload(payload);
};

export const exchangeCodeForGitHubAppUserToken = async (code: string): Promise<GitHubAppTokenExchange> => {
  return postGitHubTokenExchange(
    new URLSearchParams({
      client_id: GITHUB_OAUTH_CLIENT_ID,
      client_secret: GITHUB_OAUTH_CLIENT_SECRET,
      code
    })
  );
};

export const refreshGitHubAppUserToken = async (
  refreshToken: string
): Promise<GitHubAppTokenExchange> => {
  return postGitHubTokenExchange(
    new URLSearchParams({
      client_id: GITHUB_OAUTH_CLIENT_ID,
      client_secret: GITHUB_OAUTH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  );
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

  const payload = {
    user_id: userId,
    github_user_id: input.githubUserId ?? null,
    github_login: input.githubLogin?.trim() || null,
    installation_id: input.installationId ?? null,
    installation_account_login: input.installationAccountLogin?.trim() || null,
    installation_account_type: input.installationAccountType?.trim() || null,
    access_token_encrypted: encryptTokenValue(accessToken),
    access_token_expires_at: input.accessTokenExpiresAt ?? null,
    refresh_token_encrypted: input.refreshToken?.trim()
      ? encryptTokenValue(input.refreshToken)
      : null,
    refresh_token_expires_at: input.refreshTokenExpiresAt ?? null,
    token_encryption_key_version: getTokenEncryptionVersion(),
    token_type: input.tokenType?.trim() || null,
    scope: input.scope?.trim() || null,
    connected_at: new Date().toISOString()
  };

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
  userId,
  fallbackToken
}: {
  supabase: SupabaseClient;
  userId: string;
  fallbackToken?: string;
}): Promise<ResolvedGitHubToken | null> => {
  const normalizedUserId = userId.trim();
  const normalizedFallback = fallbackToken?.trim() ?? "";
  if (!normalizedUserId) return normalizedFallback ? { token: normalizedFallback, source: "legacy_oauth" } : null;

  const credential = await getStoredCredential({
    supabase,
    userId: normalizedUserId
  });

  if (credential) {
    const storedAccessToken = credential.access_token_encrypted?.trim()
      ? decryptTokenValue(credential.access_token_encrypted)
      : "";
    const storedRefreshToken = credential.refresh_token_encrypted?.trim()
      ? decryptTokenValue(credential.refresh_token_encrypted)
      : "";

    if (storedAccessToken && isTokenStillUsable(credential.access_token_expires_at)) {
      return { token: storedAccessToken, source: "github_app" };
    }

    if (storedRefreshToken) {
      try {
        const refreshed = await refreshGitHubAppUserToken(storedRefreshToken);
        await upsertGitHubAppUserCredentials({
          supabase,
          input: {
            userId: normalizedUserId,
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
            scope: refreshed.scope
          }
        });
        return { token: refreshed.accessToken, source: "github_app" };
      } catch {
        // Fall through to legacy fallback if available.
      }
    }
  }

  if (normalizedFallback) {
    return { token: normalizedFallback, source: "legacy_oauth" };
  }

  return null;
};
