import assert from "node:assert/strict";
import { resolveSupabaseManagementRedirectUri } from "./redirect-uri.ts";

Deno.test("resolveSupabaseManagementRedirectUri defaults to the public Supabase function callback URL", () => {
  const redirectUri = resolveSupabaseManagementRedirectUri({
    supabaseUrl: "https://ybzvpcnkbhmisqiunujq.supabase.co",
  });

  assert.equal(
    redirectUri,
    "https://ybzvpcnkbhmisqiunujq.supabase.co/functions/v1/supabase-management-callback",
  );
});

Deno.test("resolveSupabaseManagementRedirectUri accepts an explicit HTTPS override", () => {
  const redirectUri = resolveSupabaseManagementRedirectUri({
    explicitRedirectUri: "https://example.com/oauth/callback",
    supabaseUrl: "https://ybzvpcnkbhmisqiunujq.supabase.co",
  });

  assert.equal(redirectUri, "https://example.com/oauth/callback");
});

Deno.test("resolveSupabaseManagementRedirectUri rejects non-HTTPS values", () => {
  assert.throws(
    () =>
      resolveSupabaseManagementRedirectUri({
        explicitRedirectUri: "http://example.com/oauth/callback",
        supabaseUrl: "https://ybzvpcnkbhmisqiunujq.supabase.co",
      }),
    /SUPA_MANAGEMENT_OAUTH_REDIRECT_URI must use HTTPS\./,
  );
});
