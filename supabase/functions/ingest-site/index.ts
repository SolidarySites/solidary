import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { sha256 } from "../_shared/protocol-shim.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CREATE_SITE_SUPABASE_API_KEY = Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";

const siteIdRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function requireEnv() {
  if (!SUPABASE_URL || !CREATE_SITE_SUPABASE_API_KEY) {
    return "Missing SUPABASE_URL or CREATE_SITE_SUPABASE_API_KEY.";
  }
  return null;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "" };
  }

  const envError = requireEnv();
  if (envError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: envError })
    };
  }

  const payload = event.body ? JSON.parse(event.body) : {};
  const archiveId = payload.archive_id as string | undefined;
  const siteUrl = normalizeUrl(payload.site_url as string | undefined);

  if (!archiveId || !siteUrl) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "archive_id and site_url are required." })
    };
  }

  const discoveryUrl = new URL("/.well-known/solidary-links.json", siteUrl).toString();

  const response = await fetch(discoveryUrl, {
    headers: { "accept": "application/json" }
  });

  if (!response.ok) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: `Manifest fetch failed (${response.status}).`,
        url: discoveryUrl
      })
    };
  }

  const manifestText = await response.text();
  const manifestHash = await sha256(manifestText);

  let manifest: any;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    return {
      statusCode: 422,
      body: JSON.stringify({ error: "Manifest is not valid JSON." })
    };
  }

  const declaredSiteId = typeof manifest.site_id === "string" ? manifest.site_id : null;
  const siteId = declaredSiteId && siteIdRegex.test(declaredSiteId)
    ? declaredSiteId
    : crypto.randomUUID();

  const canonicalUrl = normalizeUrl(manifest.site_url) ?? siteUrl;
  const protocolVersion = typeof manifest.protocol_version === "string"
    ? manifest.protocol_version
    : "1.0";

  const supabase = createClient(SUPABASE_URL, CREATE_SITE_SUPABASE_API_KEY, {
    auth: { persistSession: false }
  });

  const { error: siteError } = await supabase
    .from("sites")
    .upsert(
      {
        id: siteId,
        canonical_url: canonicalUrl,
        protocol_version: protocolVersion,
        last_manifest_hash: manifestHash,
        last_seen_at: new Date().toISOString(),
        meta: {
          declared_site_id: declaredSiteId,
          manifest_url: discoveryUrl
        }
      },
      { onConflict: "id" }
    );

  if (siteError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: siteError.message })
    };
  }

  await supabase
    .from("site_urls")
    .upsert(
      {
        site_id: siteId,
        url: canonicalUrl,
        is_canonical: true,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "site_id,url" }
    );

  await supabase
    .from("site_urls")
    .update({ is_canonical: false })
    .eq("site_id", siteId)
    .neq("url", canonicalUrl);

  const { error: archiveSiteError } = await supabase
    .from("archive_sites")
    .upsert(
      {
        archive_id: archiveId,
        site_id: siteId,
        status: "tracked"
      },
      { onConflict: "archive_id,site_id" }
    );

  if (archiveSiteError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: archiveSiteError.message })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Site registered.",
      site_id: siteId,
      canonical_url: canonicalUrl
    })
  };
};


Deno.serve((request) => runHandler(request, handler));
