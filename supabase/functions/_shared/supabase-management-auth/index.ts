import { Buffer } from "node:buffer";
import {
  decryptTokenValue,
  encryptTokenValue,
  getTokenEncryptionVersion,
} from "../token-crypto.ts";

const SUPABASE_MANAGEMENT_API = "https://api.supabase.com";
const SUPABASE_MANAGEMENT_TOKEN_ENDPOINT =
  `${SUPABASE_MANAGEMENT_API}/v1/oauth/token`;
const TOKEN_EXPIRY_SKEW_SECONDS = 90;
const MAX_PROFILE_ORGANIZATIONS = 8;
const MAX_PROFILE_PROJECTS = 12;
const REQUESTED_MANAGEMENT_SCOPES = [
  "organizations:read",
  "projects:read",
  "projects:write",
  "database:write",
  "edge_functions:write",
  "secrets:read",
  "secrets:write",
] as const;
const SUPA_MANAGEMENT_OAUTH_CLIENT_ID =
  Deno.env.get("SUPA_MANAGEMENT_OAUTH_CLIENT_ID") ?? "";
const SUPA_MANAGEMENT_OAUTH_CLIENT_SECRET =
  Deno.env.get("SUPA_MANAGEMENT_OAUTH_CLIENT_SECRET") ?? "";

type SupabaseManagementTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

type StoredSupabaseManagementConnectionRow = {
  user_id: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  refresh_token_encrypted: string | null;
  refresh_token_expires_at: string | null;
  token_encryption_key_version: string | null;
  token_type: string | null;
  scope: string | null;
  connected_at: string | null;
};

type SupabaseManagementOrganizationPayload = {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
};

type SupabaseManagementProjectPayload = {
  id?: unknown;
  ref?: unknown;
  organization_id?: unknown;
  organization_slug?: unknown;
  name?: unknown;
  region?: unknown;
  status?: unknown;
};

type SupabaseManagementClient = {
  from: (table: string) => any;
};

export type SupabaseManagementConnectionState =
  | "connected"
  | "not_connected"
  | "needs_reauth"
  | "error";

export type SupabaseManagementOrganizationSummary = {
  id: string;
  slug: string | null;
  name: string;
};

export type SupabaseManagementProjectSummary = {
  id: string;
  ref: string | null;
  organizationId: string | null;
  organizationSlug: string | null;
  name: string;
  region: string | null;
  status: string | null;
};

export type SupabaseManagementConnectionStatus = {
  connected: boolean;
  state: SupabaseManagementConnectionState;
  message: string | null;
  grantedScopes: string[];
  organizations: SupabaseManagementOrganizationSummary[];
  projects: SupabaseManagementProjectSummary[];
  projectsTruncated: boolean;
};

export type UpsertSupabaseManagementConnectionInput = {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
};

type SupabaseManagementTokenExchange = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
};

type ResolvedSupabaseManagementAccess = {
  connection: StoredSupabaseManagementConnectionRow;
  accessToken: string;
};

export class SupabaseManagementReauthError extends Error {
  constructor(message = "Reconnect your Supabase account to continue.") {
    super(message);
    this.name = "SupabaseManagementReauthError";
  }
}

const normalizeTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizeScopeString = (value: string | null | undefined) => {
  return splitSupabaseManagementScopes(value).join(" ");
};

export const splitSupabaseManagementScopes = (
  value: string | null | undefined,
) => {
  const seen = new Set<string>();
  return (value ?? "")
    .split(/[\s,]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    });
};

const parseDateToMs = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeExpiresAt = (seconds: unknown): string | null => {
  const normalized =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? Math.floor(seconds)
      : 0;
  if (!normalized) return null;
  return new Date(Date.now() + normalized * 1000).toISOString();
};

export const isSupabaseManagementTokenUsable = (
  expiresAt: string | null | undefined,
) => {
  if (!expiresAt) return true;
  const expiresAtMs = parseDateToMs(expiresAt);
  if (!expiresAtMs) return false;
  return expiresAtMs - Date.now() > TOKEN_EXPIRY_SKEW_SECONDS * 1000;
};

const normalizeStoredConnection = (
  value: unknown,
): StoredSupabaseManagementConnectionRow | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const userId = normalizeTrimmedString(row.user_id);
  if (!userId) {
    return null;
  }

  return {
    user_id: userId,
    access_token_encrypted:
      normalizeTrimmedString(row.access_token_encrypted) || null,
    access_token_expires_at:
      normalizeTrimmedString(row.access_token_expires_at) || null,
    refresh_token_encrypted:
      normalizeTrimmedString(row.refresh_token_encrypted) || null,
    refresh_token_expires_at:
      normalizeTrimmedString(row.refresh_token_expires_at) || null,
    token_encryption_key_version:
      normalizeTrimmedString(row.token_encryption_key_version) || null,
    token_type: normalizeTrimmedString(row.token_type) || null,
    scope: normalizeTrimmedString(row.scope) || null,
    connected_at: normalizeTrimmedString(row.connected_at) || null,
  };
};

const getTokenEndpointBasicAuthHeader = () => {
  const clientId = SUPA_MANAGEMENT_OAUTH_CLIENT_ID.trim();
  const clientSecret = SUPA_MANAGEMENT_OAUTH_CLIENT_SECRET.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Supabase management OAuth is not configured.");
  }

  return `Basic ${
    Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")
  }`;
};

export const parseSupabaseManagementTokenPayload = (
  payload: SupabaseManagementTokenPayload,
): SupabaseManagementTokenExchange => {
  const accessToken = normalizeTrimmedString(payload.access_token);
  if (!accessToken) {
    const description = normalizeTrimmedString(payload.error_description) ||
      normalizeTrimmedString(payload.error) ||
      "Supabase did not return an access token.";
    throw new Error(description);
  }

  return {
    accessToken,
    refreshToken: normalizeTrimmedString(payload.refresh_token),
    tokenType: normalizeTrimmedString(payload.token_type) || "Bearer",
    scope: normalizeScopeString(payload.scope),
    accessTokenExpiresAt: computeExpiresAt(payload.expires_in),
    refreshTokenExpiresAt: computeExpiresAt(payload.refresh_token_expires_in),
  };
};

const postSupabaseManagementTokenExchange = async (
  body: URLSearchParams,
): Promise<SupabaseManagementTokenExchange> => {
  const response = await fetch(SUPABASE_MANAGEMENT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: getTokenEndpointBasicAuthHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload =
    (await response.json().catch(() => ({}))) as SupabaseManagementTokenPayload;
  if (!response.ok) {
    throw new Error(
      normalizeTrimmedString(payload.error_description) ||
        normalizeTrimmedString(payload.error) ||
        `Supabase token exchange failed (${response.status}).`,
    );
  }

  return parseSupabaseManagementTokenPayload(payload);
};

export const exchangeSupabaseManagementAuthorizationCode = async ({
  code,
  redirectUri,
  codeVerifier,
}: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) => {
  return postSupabaseManagementTokenExchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: code.trim(),
      redirect_uri: redirectUri.trim(),
      code_verifier: codeVerifier.trim(),
    }),
  );
};

export const refreshSupabaseManagementAccessToken = async ({
  refreshToken,
}: {
  refreshToken: string;
}) => {
  return postSupabaseManagementTokenExchange(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken.trim(),
    }),
  );
};

export const upsertSupabaseManagementConnection = async ({
  supabase,
  input,
}: {
  supabase: SupabaseManagementClient;
  input: UpsertSupabaseManagementConnectionInput;
}) => {
  const userId = input.userId.trim();
  const accessToken = input.accessToken.trim();
  if (!userId || !accessToken) {
    throw new Error(
      "Supabase management connection is missing required fields.",
    );
  }

  const encryptedAccessToken = encryptTokenValue(accessToken);
  const normalizedRefreshToken = input.refreshToken?.trim() ?? "";
  const encryptedRefreshToken = normalizedRefreshToken
    ? encryptTokenValue(normalizedRefreshToken)
    : null;

  const { error } = await supabase.from("supabase_management_connections")
    .upsert({
      user_id: userId,
      access_token_encrypted: encryptedAccessToken,
      access_token_expires_at: input.accessTokenExpiresAt ?? null,
      refresh_token_encrypted: encryptedRefreshToken,
      refresh_token_expires_at: input.refreshTokenExpiresAt ?? null,
      token_encryption_key_version: getTokenEncryptionVersion(),
      token_type: input.tokenType?.trim() ?? null,
      scope: normalizeScopeString(input.scope),
      connected_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(error.message);
  }
};

export const disconnectSupabaseManagementConnection = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseManagementClient;
  userId: string;
}) => {
  const { error } = await supabase
    .from("supabase_management_connections")
    .delete()
    .eq("user_id", userId.trim());

  if (error) {
    throw new Error(error.message);
  }
};

const getStoredSupabaseManagementConnection = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseManagementClient;
  userId: string;
}) => {
  const { data, error } = await supabase
    .from("supabase_management_connections")
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
        "connected_at",
      ].join(", "),
    )
    .eq("user_id", userId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeStoredConnection(data);
};

export const resolveSupabaseManagementAccessForConnection = async ({
  connection,
  onRefresh,
}: {
  connection: StoredSupabaseManagementConnectionRow;
  onRefresh: (
    connection: StoredSupabaseManagementConnectionRow,
  ) => Promise<StoredSupabaseManagementConnectionRow>;
}): Promise<ResolvedSupabaseManagementAccess> => {
  const accessToken = connection.access_token_encrypted
    ? decryptTokenValue(connection.access_token_encrypted)
    : "";
  if (!accessToken) {
    throw new SupabaseManagementReauthError();
  }

  if (isSupabaseManagementTokenUsable(connection.access_token_expires_at)) {
    return {
      connection,
      accessToken,
    };
  }

  const refreshToken = connection.refresh_token_encrypted
    ? decryptTokenValue(connection.refresh_token_encrypted)
    : "";
  if (!refreshToken) {
    throw new SupabaseManagementReauthError();
  }

  const refreshedConnection = await onRefresh(connection);
  const refreshedAccessToken = refreshedConnection.access_token_encrypted
    ? decryptTokenValue(refreshedConnection.access_token_encrypted)
    : "";
  if (!refreshedAccessToken) {
    throw new SupabaseManagementReauthError();
  }

  return {
    connection: refreshedConnection,
    accessToken: refreshedAccessToken,
  };
};

const refreshStoredSupabaseManagementConnection = async ({
  supabase,
  connection,
}: {
  supabase: SupabaseManagementClient;
  connection: StoredSupabaseManagementConnectionRow;
}) => {
  const refreshToken = connection.refresh_token_encrypted
    ? decryptTokenValue(connection.refresh_token_encrypted)
    : "";
  if (!refreshToken) {
    throw new SupabaseManagementReauthError();
  }

  const refreshed = await refreshSupabaseManagementAccessToken({
    refreshToken,
  });
  await upsertSupabaseManagementConnection({
    supabase,
    input: {
      userId: connection.user_id,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      tokenType: refreshed.tokenType,
      scope: refreshed.scope || connection.scope,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ??
        connection.refresh_token_expires_at,
    },
  });

  const nextConnection = await getStoredSupabaseManagementConnection({
    supabase,
    userId: connection.user_id,
  });
  if (!nextConnection) {
    throw new SupabaseManagementReauthError();
  }
  return nextConnection;
};

const fetchSupabaseManagementJson = async <T>({
  path,
  accessToken,
}: {
  path: string;
  accessToken: string;
}) => {
  const response = await fetch(
    new URL(path, SUPABASE_MANAGEMENT_API).toString(),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = (await response.json().catch(() => null)) as T | null;
  return {
    response,
    payload,
  };
};

const readSupabaseManagementResources = async ({
  accessToken,
}: {
  accessToken: string;
}) => {
  const [organizationsResult, projectsResult] = await Promise.all([
    fetchSupabaseManagementJson<unknown[]>({
      path: "/v1/organizations",
      accessToken,
    }),
    fetchSupabaseManagementJson<unknown[]>({
      path: "/v1/projects",
      accessToken,
    }),
  ]);

  return {
    organizationsResult,
    projectsResult,
  };
};

const mapOrganizations = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const payload = entry as SupabaseManagementOrganizationPayload;
      const id = normalizeTrimmedString(payload.id);
      const name = normalizeTrimmedString(payload.name);
      if (!id || !name) {
        return null;
      }

      return {
        id,
        slug: normalizeTrimmedString(payload.slug) || null,
        name,
      } satisfies SupabaseManagementOrganizationSummary;
    })
    .filter((entry): entry is SupabaseManagementOrganizationSummary =>
      Boolean(entry)
    );
};

const mapProjects = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const payload = entry as SupabaseManagementProjectPayload;
      const id = normalizeTrimmedString(payload.id);
      const name = normalizeTrimmedString(payload.name);
      if (!id || !name) {
        return null;
      }

      return {
        id,
        ref: normalizeTrimmedString(payload.ref) || null,
        organizationId: normalizeTrimmedString(payload.organization_id) || null,
        organizationSlug: normalizeTrimmedString(payload.organization_slug) ||
          null,
        name,
        region: normalizeTrimmedString(payload.region) || null,
        status: normalizeTrimmedString(payload.status) || null,
      } satisfies SupabaseManagementProjectSummary;
    })
    .filter((entry): entry is SupabaseManagementProjectSummary =>
      Boolean(entry)
    );
};

const buildStatusFromResources = ({
  scope,
  organizations,
  projects,
}: {
  scope: string | null | undefined;
  organizations: SupabaseManagementOrganizationSummary[];
  projects: SupabaseManagementProjectSummary[];
}): SupabaseManagementConnectionStatus => {
  const grantedScopes = splitSupabaseManagementScopes(scope);
  const resolvedScopes = grantedScopes.length
    ? grantedScopes
    : [...REQUESTED_MANAGEMENT_SCOPES];

  return {
    connected: true,
    state: "connected",
    message: null,
    grantedScopes: resolvedScopes,
    organizations: organizations.slice(0, MAX_PROFILE_ORGANIZATIONS),
    projects: projects.slice(0, MAX_PROFILE_PROJECTS),
    projectsTruncated: projects.length > MAX_PROFILE_PROJECTS,
  };
};

const getUnauthorizedStatus = (
  scope: string | null | undefined,
): SupabaseManagementConnectionStatus => ({
  connected: false,
  state: "needs_reauth",
  message: "Your Supabase account needs to be reconnected.",
  grantedScopes: splitSupabaseManagementScopes(scope),
  organizations: [],
  projects: [],
  projectsTruncated: false,
});

export const getSupabaseManagementConnectionStatusForUser = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseManagementClient;
  userId: string;
}): Promise<SupabaseManagementConnectionStatus> => {
  const connection = await getStoredSupabaseManagementConnection({
    supabase,
    userId,
  });
  if (!connection) {
    return {
      connected: false,
      state: "not_connected",
      message: null,
      grantedScopes: [],
      organizations: [],
      projects: [],
      projectsTruncated: false,
    };
  }

  let access: ResolvedSupabaseManagementAccess;
  try {
    access = await resolveSupabaseManagementAccessForConnection({
      connection,
      onRefresh: async (staleConnection) =>
        refreshStoredSupabaseManagementConnection({
          supabase,
          connection: staleConnection,
        }),
    });
  } catch (error) {
    if (error instanceof SupabaseManagementReauthError) {
      return getUnauthorizedStatus(connection.scope);
    }
    throw error;
  }

  const resources = await readSupabaseManagementResources({
    accessToken: access.accessToken,
  });

  const hasUnauthorizedResponse =
    resources.organizationsResult.response.status === 401 ||
    resources.projectsResult.response.status === 401;
  if (hasUnauthorizedResponse) {
    try {
      access = await resolveSupabaseManagementAccessForConnection({
        connection: {
          ...access.connection,
          access_token_expires_at: new Date(0).toISOString(),
        },
        onRefresh: async (staleConnection) =>
          refreshStoredSupabaseManagementConnection({
            supabase,
            connection: staleConnection,
          }),
      });
    } catch (error) {
      if (error instanceof SupabaseManagementReauthError) {
        return getUnauthorizedStatus(connection.scope);
      }
      throw error;
    }

    const refreshedResources = await readSupabaseManagementResources({
      accessToken: access.accessToken,
    });
    if (
      refreshedResources.organizationsResult.response.status === 401 ||
      refreshedResources.projectsResult.response.status === 401
    ) {
      return getUnauthorizedStatus(access.connection.scope);
    }

    if (
      !refreshedResources.organizationsResult.response.ok ||
      !refreshedResources.projectsResult.response.ok
    ) {
      return {
        connected: false,
        state: "error",
        message:
          "Could not read your Supabase organizations or projects right now.",
        grantedScopes: splitSupabaseManagementScopes(access.connection.scope),
        organizations: [],
        projects: [],
        projectsTruncated: false,
      };
    }

    return buildStatusFromResources({
      scope: access.connection.scope,
      organizations: mapOrganizations(
        refreshedResources.organizationsResult.payload,
      ),
      projects: mapProjects(refreshedResources.projectsResult.payload),
    });
  }

  if (
    !resources.organizationsResult.response.ok ||
    !resources.projectsResult.response.ok
  ) {
    return {
      connected: false,
      state: "error",
      message:
        "Could not read your Supabase organizations or projects right now.",
      grantedScopes: splitSupabaseManagementScopes(access.connection.scope),
      organizations: [],
      projects: [],
      projectsTruncated: false,
    };
  }

  return buildStatusFromResources({
    scope: access.connection.scope,
    organizations: mapOrganizations(resources.organizationsResult.payload),
    projects: mapProjects(resources.projectsResult.payload),
  });
};

export const resolveSupabaseManagementAccessForUser = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseManagementClient;
  userId: string;
}): Promise<{ accessToken: string; scope: string }> => {
  const connection = await getStoredSupabaseManagementConnection({
    supabase,
    userId,
  });
  if (!connection) {
    throw new SupabaseManagementReauthError();
  }

  const access = await resolveSupabaseManagementAccessForConnection({
    connection,
    onRefresh: async (staleConnection) =>
      refreshStoredSupabaseManagementConnection({
        supabase,
        connection: staleConnection,
      }),
  });

  return {
    accessToken: access.accessToken,
    scope: access.connection.scope ?? "",
  };
};
