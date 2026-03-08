import assert from "node:assert/strict";
import { encryptTokenValue } from "../token-crypto.ts";
import {
  parseSupabaseManagementTokenPayload,
  resolveSupabaseManagementAccessForConnection,
  SupabaseManagementReauthError
} from "./index.ts";

const createConnection = ({
  accessToken = "access-token",
  accessTokenExpiresAt = null,
  refreshToken = "",
  scope = "projects:read"
}: {
  accessToken?: string;
  accessTokenExpiresAt?: string | null;
  refreshToken?: string;
  scope?: string;
} = {}) => {
  return {
    user_id: "user-1",
    access_token_encrypted: encryptTokenValue(accessToken),
    access_token_expires_at: accessTokenExpiresAt,
    refresh_token_encrypted: refreshToken ? encryptTokenValue(refreshToken) : null,
    refresh_token_expires_at: null,
    token_encryption_key_version: "v1",
    token_type: "Bearer",
    scope,
    connected_at: new Date().toISOString()
  };
};

Deno.test("resolveSupabaseManagementAccessForConnection returns existing usable token", async () => {
  Deno.env.set(
    "TOKEN_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );

  const connection = createConnection();
  const resolved = await resolveSupabaseManagementAccessForConnection({
    connection,
    onRefresh: async () => connection
  });

  assert.equal(resolved.accessToken, "access-token");
});

Deno.test("resolveSupabaseManagementAccessForConnection requires reauth when refresh token is missing", async () => {
  Deno.env.set(
    "TOKEN_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );

  const connection = createConnection({
    accessTokenExpiresAt: new Date(0).toISOString(),
    refreshToken: ""
  });

  await assert.rejects(
    () =>
      resolveSupabaseManagementAccessForConnection({
        connection,
        onRefresh: async () => connection
      }),
    SupabaseManagementReauthError
  );
});

Deno.test("parseSupabaseManagementTokenPayload surfaces provider errors", async () => {
  await assert.rejects(
    async () => {
      parseSupabaseManagementTokenPayload({
        error: "invalid_grant",
        error_description: "Authorization code expired."
      });
    },
    /Authorization code expired\./
  );
});
