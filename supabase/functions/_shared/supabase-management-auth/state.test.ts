import assert from "node:assert/strict";
import {
  createSupabaseManagementCodeChallenge,
  createSupabaseManagementCodeVerifier,
  createSupabaseManagementState,
  parseSupabaseManagementState
} from "./state.ts";

Deno.test("Supabase management state round-trips code verifier and metadata", () => {
  Deno.env.set(
    "TOKEN_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );

  const codeVerifier = createSupabaseManagementCodeVerifier();
  const state = createSupabaseManagementState({
    userId: "user-1",
    returnTo: "/profile?tab=settings",
    returnOrigin: "https://solidary.link",
    codeVerifier,
    secret: "state-secret"
  });

  const parsed = parseSupabaseManagementState({
    encodedState: state,
    secret: "state-secret"
  });

  assert.equal(parsed.userId, "user-1");
  assert.equal(parsed.returnTo, "/profile?tab=settings");
  assert.equal(parsed.returnOrigin, "https://solidary.link");
  assert.equal(parsed.codeVerifier, codeVerifier);
  assert.equal(createSupabaseManagementCodeChallenge(codeVerifier).length > 20, true);
});

Deno.test("Supabase management state rejects tampering", async () => {
  Deno.env.set(
    "TOKEN_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );

  const state = createSupabaseManagementState({
    userId: "user-1",
    codeVerifier: "verifier",
    secret: "state-secret"
  });

  const tampered = `${state}x`;

  await assert.rejects(
    async () => {
      parseSupabaseManagementState({
        encodedState: tampered,
        secret: "state-secret"
      });
    },
    /Invalid state signature\./
  );
});
