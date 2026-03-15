import { decryptTokenValue, encryptTokenValue } from "./token-crypto.ts";

export type IndexAdminBridgeRole = "owner" | "admin" | "editor" | "contributor";

export type IndexAdminBridgePayload = {
  archiveId: string;
  userId: string;
  role: IndexAdminBridgeRole;
  expiresAt: string;
};

const isBridgeRole = (value: string): value is IndexAdminBridgeRole =>
  value === "owner" || value === "admin" || value === "editor" ||
  value === "contributor";

export const createIndexAdminBridgeToken = ({
  archiveId,
  userId,
  role,
  expiresAt,
}: IndexAdminBridgePayload) =>
  encryptTokenValue(
    JSON.stringify({
      archiveId: archiveId.trim(),
      userId: userId.trim(),
      role,
      expiresAt,
    }),
  );

export const parseIndexAdminBridgeToken = (
  token: string,
): IndexAdminBridgePayload => {
  const raw = decryptTokenValue(token);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid admin bridge token.");
  }

  const archiveId = typeof parsed.archiveId === "string"
    ? parsed.archiveId.trim()
    : "";
  const userId = typeof parsed.userId === "string" ? parsed.userId.trim() : "";
  const role = typeof parsed.role === "string" && isBridgeRole(parsed.role)
    ? parsed.role
    : null;
  const expiresAt = typeof parsed.expiresAt === "string"
    ? parsed.expiresAt.trim()
    : "";

  if (!archiveId || !userId || !role || !expiresAt) {
    throw new Error("Admin bridge token is missing required fields.");
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("Admin bridge token expiration is invalid.");
  }
  if (expiresAtMs <= Date.now()) {
    throw new Error("Admin bridge token has expired.");
  }

  return {
    archiveId,
    userId,
    role,
    expiresAt,
  };
};

export const buildStandaloneAdminUrl = ({
  siteUrl,
  bridgeToken,
}: {
  siteUrl: string;
  bridgeToken: string;
}) => {
  const normalizedSiteUrl = siteUrl.trim();
  if (!normalizedSiteUrl || !bridgeToken.trim()) {
    return "";
  }

  try {
    const base = normalizedSiteUrl.endsWith("/")
      ? normalizedSiteUrl
      : `${normalizedSiteUrl}/`;
    const adminUrl = new URL("admin/", base);
    adminUrl.searchParams.set("bridge", bridgeToken.trim());
    return adminUrl.toString();
  } catch {
    return "";
  }
};
