import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AES_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const ENCRYPTION_VERSION = "v1";

const parseEncryptionKey = () => {
  const raw = (process.env.TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    throw new Error("Missing TOKEN_ENCRYPTION_KEY.");
  }

  const hexCandidate = raw.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hexCandidate) && hexCandidate.length === 64) {
    return Buffer.from(hexCandidate, "hex");
  }

  const normalizedBase64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 =
    normalizedBase64 + "=".repeat((4 - (normalizedBase64.length % 4 || 4)) % 4);
  const base64Bytes = Buffer.from(paddedBase64, "base64");
  if (base64Bytes.length === 32) {
    return base64Bytes;
  }

  throw new Error(
    "TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64/base64url-encoded 32-byte value)."
  );
};

export const encryptTokenValue = (plaintext: string) => {
  const value = plaintext.trim();
  if (!value) return "";

  const key = parseEncryptionKey();
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
};

export const decryptTokenValue = (encoded: string | null | undefined) => {
  const value = encoded?.trim() ?? "";
  if (!value) return "";

  const [version, ivRaw, tagRaw, payloadRaw] = value.split(".");
  if (!version || !ivRaw || !tagRaw || !payloadRaw || version !== ENCRYPTION_VERSION) {
    throw new Error("Token payload is not encrypted with the expected format.");
  }

  const key = parseEncryptionKey();
  const iv = Buffer.from(ivRaw, "base64url");
  const authTag = Buffer.from(tagRaw, "base64url");
  const ciphertext = Buffer.from(payloadRaw, "base64url");

  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

export const getTokenEncryptionVersion = () => ENCRYPTION_VERSION;
