import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_DELETE_REPO_SECRET_KEY = Deno.env.get("SUPABASE_DELETE_REPO_SECRET_KEY") ?? "";
const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";

console.log("Loaded cleanup-draft-images function with config:", { SUPABASE_URL, SUPABASE_DELETE_REPO_SECRET_KEY });

const requireEnv = () => {
  if (!SUPABASE_URL || !SUPABASE_DELETE_REPO_SECRET_KEY) {
    return "Missing SUPABASE_URL or SUPABASE_DELETE_REPO_SECRET_KEY.";
  }
  return null;
};

const parseBearerToken = (authorizationHeader: string | undefined) => {
  const header = authorizationHeader?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const normalizePublishedBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const normalizeSitePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};
const getSitePathFromStoragePath = (storagePath: string) => {
  const filename = storagePath.trim().split("/").pop()?.trim();
  if (!filename) return "";
  return `/solidary-media/images/pages/${filename}`;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const envError = requireEnv();
  if (envError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: envError })
    };
  }

  const accessToken = parseBearerToken(
    event.headers.authorization ?? event.headers.Authorization
  );
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing bearer token." })
    };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON payload." })
    };
  }
  const draftId = typeof payload?.draftId === "string" ? payload.draftId.trim() : "";
  if (!draftId) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing draftId." })
    };
  }

  const publishedSiteBaseUrl =
    typeof payload?.publishedSiteBaseUrl === "string"
      ? normalizePublishedBaseUrl(payload.publishedSiteBaseUrl)
      : "";
  if (!publishedSiteBaseUrl) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing publishedSiteBaseUrl." })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_DELETE_REPO_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized." })
    };
  }

  const { data: draft, error: draftError } = await supabase
    .from("site_drafts")
    .select("id, site_id, owner_user_id")
    .eq("id", draftId)
    .maybeSingle();

  if (draftError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: draftError.message })
    };
  }

  if (!draft) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Draft not found." })
    };
  }

  const siteId = typeof draft.site_id === "string" && draft.site_id.trim() ? draft.site_id : draft.id;

  let hasAccess = draft.owner_user_id === user.id;
  if (!hasAccess) {
    const { data: adminAccess, error: adminAccessError } = await supabase
      .from("site_admins")
      .select("site_id")
      .eq("site_id", siteId)
      .eq("user_id", user.id)
      .in("role", ["admin", "editor"])
      .maybeSingle();

    if (adminAccessError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: adminAccessError.message })
      };
    }

    hasAccess = Boolean(adminAccess);
  }

  if (!hasAccess) {
    return {
      statusCode: 403,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Forbidden." })
    };
  }

  const { data: images, error: imagesError } = await supabase
    .from("site_draft_images")
    .select("id, storage_path, site_path")
    .eq("draft_id", draftId);

  if (imagesError) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: imagesError.message })
    };
  }

  const storagePaths = (images ?? [])
    .map((image) => (typeof image.storage_path === "string" ? image.storage_path.trim() : ""))
    .filter(Boolean);

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(SITE_DRAFT_IMAGES_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: storageError.message })
      };
    }
  }

  const rowsToUpdate = (images ?? [])
    .map((image) => {
      const id = typeof image.id === "string" ? image.id : "";
      const storagePath = typeof image.storage_path === "string" ? image.storage_path : "";
      const rawSitePath = typeof image.site_path === "string" ? image.site_path : "";
      const sitePath = normalizeSitePath(rawSitePath || getSitePathFromStoragePath(storagePath));
      if (!id || !sitePath) return null;
      return {
        id,
        sitePath,
        publicUrl: `${publishedSiteBaseUrl}${sitePath}`
      };
    })
    .filter((row): row is { id: string; sitePath: string; publicUrl: string } => Boolean(row));

  for (const row of rowsToUpdate) {
    const { error: updateError } = await supabase
      .from("site_draft_images")
      .update({
        public_url: row.publicUrl,
        site_path: row.sitePath
      })
      .eq("id", row.id)
      .eq("draft_id", draftId);

    if (updateError) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: updateError.message })
      };
    }
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deletedCount: storagePaths.length,
      updated: rowsToUpdate
    })
  };
};


Deno.serve((request) => runHandler(request, handler));
