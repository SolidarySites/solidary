import { Buffer } from "node:buffer";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptTokenValue, encryptTokenValue } from "../token-crypto.ts";

const STATE_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_RETURN_TO = "/profile";

type SupabaseManagementStatePayload = {
  userId: string;
  returnTo: string;
  returnOrigin?: string | null;
  codeVerifierEncrypted: string;
  issuedAtMs: number;
  nonce: string;
};

const normalizeReturnTo = (value: string | undefined): string => {
  const candidate = value?.trim() ?? "";
  if (!candidate.startsWith("/")) return DEFAULT_RETURN_TO;
  if (candidate.startsWith("//")) return DEFAULT_RETURN_TO;
  return candidate;
};

const normalizeReturnOrigin = (value: string | null | undefined): string | null => {
  const candidate = value?.trim() ?? "";
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

const signStateData = (data: string, secret: string): string => {
  return createHmac("sha256", secret).update(data).digest("base64url");
};

export const createSupabaseManagementCodeVerifier = () => {
  return randomBytes(32).toString("base64url");
};

export const createSupabaseManagementCodeChallenge = (codeVerifier: string) => {
  return createHash("sha256").update(codeVerifier).digest("base64url");
};

export const createSupabaseManagementState = ({
  userId,
  returnTo,
  returnOrigin,
  codeVerifier,
  secret
}: {
  userId: string;
  returnTo?: string;
  returnOrigin?: string | null;
  codeVerifier: string;
  secret: string;
}) => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Cannot create state without user id.");
  }

  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error("Cannot create state without secret.");
  }

  const normalizedCodeVerifier = codeVerifier.trim();
  if (!normalizedCodeVerifier) {
    throw new Error("Cannot create state without code verifier.");
  }

  const payload: SupabaseManagementStatePayload = {
    userId: normalizedUserId,
    returnTo: normalizeReturnTo(returnTo),
    returnOrigin: normalizeReturnOrigin(returnOrigin),
    codeVerifierEncrypted: encryptTokenValue(normalizedCodeVerifier),
    issuedAtMs: Date.now(),
    nonce: randomBytes(12).toString("base64url")
  };

  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signStateData(data, normalizedSecret);
  return `${data}.${signature}`;
};

export const parseSupabaseManagementState = ({
  encodedState,
  secret
}: {
  encodedState: string;
  secret: string;
}) => {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error("State secret is not configured.");
  }

  const dotIndex = encodedState.indexOf(".");
  if (dotIndex <= 0) {
    throw new Error("Invalid state payload.");
  }

  const data = encodedState.slice(0, dotIndex);
  const signature = encodedState.slice(dotIndex + 1);
  if (!data || !signature) {
    throw new Error("Invalid state payload.");
  }

  const expectedSignature = signStateData(data, normalizedSecret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid state signature.");
  }

  let payload: SupabaseManagementStatePayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SupabaseManagementStatePayload;
  } catch {
    throw new Error("Invalid state payload.");
  }

  const userId = payload.userId?.trim() ?? "";
  if (!userId) {
    throw new Error("State is missing user id.");
  }

  const issuedAtMs =
    typeof payload.issuedAtMs === "number" && Number.isFinite(payload.issuedAtMs)
      ? payload.issuedAtMs
      : 0;
  if (!issuedAtMs || Date.now() - issuedAtMs > STATE_MAX_AGE_MS) {
    throw new Error("State has expired. Start again.");
  }

  const codeVerifier = decryptTokenValue(payload.codeVerifierEncrypted);
  if (!codeVerifier) {
    throw new Error("State is missing code verifier.");
  }

  return {
    userId,
    returnTo: normalizeReturnTo(payload.returnTo),
    returnOrigin: normalizeReturnOrigin(payload.returnOrigin),
    codeVerifier
  };
};
