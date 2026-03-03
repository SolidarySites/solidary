import { runHandler } from "../_shared/request-adapter.ts";
import { Buffer } from "node:buffer";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { resolveGitHubTokenForUser } from "../_shared/github-auth-broker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CREATE_SITE_SUPABASE_API_KEY = Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const WORKER_PATH = "/.netlify/functions/github-create-repo-worker-background";
const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";
const MAX_STAGED_SITE_IMAGE_BYTES = 4 * 1024 * 1024;

type StartRepoProvisionBody = {
  name?: string;
  description?: string;
  private?: boolean;
  supabase_access_token?: string;
  site_id?: string;
  site_title?: string;
  site_description?: string;
  site_image_path?: string;
  site_image_storage_path?: string;
  site_image_content_b64?: string;
  site_image_thumb_path?: string;
  site_image_thumb_storage_path?: string;
  site_image_thumb_content_b64?: string;
  og_image_path?: string;
  og_image_storage_path?: string;
  og_image_content_b64?: string;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBody = (rawBody: string | null): StartRepoProvisionBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as StartRepoProvisionBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const normalizeStoragePath = (pathValue: string) => {
  const normalized = pathValue.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("Site image storage path is empty.");
  }
  if (normalized.split("/").includes("..")) {
    throw new Error("Site image storage path contains invalid segments.");
  }
  return normalized;
};

const getFilenameFromRepoPath = (pathValue: string, fallbackFilename: string) => {
  const filename = pathValue.trim().split("/").pop()?.trim() ?? "";
  if (!filename || filename === "." || filename === "..") {
    return fallbackFilename;
  }
  return filename;
};

const decodeImageBase64 = (value: string, label: string) => {
  const normalizedB64 = value.replace(/^data:[^;]+;base64,/, "").trim();
  if (!normalizedB64) {
    throw new Error(`${label} base64 payload is empty.`);
  }

  const imageBuffer = Buffer.from(normalizedB64, "base64");
  if (!imageBuffer.length) {
    throw new Error(`${label} base64 payload could not be decoded.`);
  }
  if (imageBuffer.length > MAX_STAGED_SITE_IMAGE_BYTES) {
    throw new Error(`${label} exceeds ${MAX_STAGED_SITE_IMAGE_BYTES} byte limit for create flow.`);
  }

  return imageBuffer;
};

const resolveOrigin = (event: Parameters<Handler>[0]) => {
  const rawUrl = event.rawUrl?.trim();
  if (rawUrl) {
    try {
      return new URL(rawUrl).origin;
    } catch {
      // Fall through to forwarded headers.
    }
  }

  const forwardedHost = event.headers["x-forwarded-host"] ?? event.headers.host;
  const forwardedProto = event.headers["x-forwarded-proto"] ?? "https";
  const host = forwardedHost?.trim() ?? "";
  if (!host) {
    throw new Error("Missing request host header.");
  }
  return `${forwardedProto}://${host}`;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  if (!SUPABASE_URL || !CREATE_SITE_SUPABASE_API_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or CREATE_SITE_SUPABASE_API_KEY."
    });
  }

  let body: StartRepoProvisionBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
    });
  }

  const name = body.name?.trim();
  const description = typeof body.description === "string" ? body.description : "";
  const isPrivate = body.private === undefined ? false : Boolean(body.private);
  const supabaseAccessToken = body.supabase_access_token?.trim();
  const siteId = body.site_id?.trim();
  const siteTitle = body.site_title?.trim();
  const siteDescription = body.site_description?.trim();
  const siteImagePath = body.site_image_path?.trim();
  const rawSiteImageStoragePath = body.site_image_storage_path?.trim();
  const siteImageContentB64 = body.site_image_content_b64?.trim();
  const siteImageThumbPath = body.site_image_thumb_path?.trim();
  const rawSiteImageThumbStoragePath = body.site_image_thumb_storage_path?.trim();
  const siteImageThumbContentB64 = body.site_image_thumb_content_b64?.trim();
  const ogImagePath = body.og_image_path?.trim();
  const rawOgImageStoragePath = body.og_image_storage_path?.trim();
  const ogImageContentB64 = body.og_image_content_b64?.trim();

  if (!name || !supabaseAccessToken) {
    return safeJson(400, {
      error: "Missing name or supabase_access_token."
    });
  }

  const supabase = createClient(SUPABASE_URL, CREATE_SITE_SUPABASE_API_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  let siteImageStoragePath = "";
  let siteImageThumbStoragePath = "";
  let ogImageStoragePath = "";
  const stagedStoragePaths = new Set<string>();
  const cleanupStagedSiteImages = async () => {
    if (!stagedStoragePaths.size) return;
    await supabase.storage.from(SITE_DRAFT_IMAGES_BUCKET).remove([...stagedStoragePaths]);
  };

  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(supabaseAccessToken);

    if (userError || !user) {
      return safeJson(401, { error: "Invalid Supabase session." });
    }

    const resolvedGitHubAuth = await resolveGitHubTokenForUser({
      supabase,
      userId: user.id
    });
    if (!resolvedGitHubAuth?.token) {
      return safeJson(412, {
        error:
          "GitHub authorization missing. Sign in with GitHub again from Profile settings and retry."
      });
    }

    if (rawSiteImageStoragePath) {
      try {
        siteImageStoragePath = normalizeStoragePath(rawSiteImageStoragePath);
      } catch (error) {
        return safeJson(400, {
          error: error instanceof Error ? error.message : "Invalid site_image_storage_path."
        });
      }

      if (!siteImageStoragePath.startsWith(`${user.id}/`)) {
        return safeJson(403, {
          error: "site_image_storage_path must be scoped to the authenticated user."
        });
      }
      stagedStoragePaths.add(siteImageStoragePath);
    }

    if (rawSiteImageThumbStoragePath) {
      try {
        siteImageThumbStoragePath = normalizeStoragePath(rawSiteImageThumbStoragePath);
      } catch (error) {
        return safeJson(400, {
          error:
            error instanceof Error
              ? `Invalid site_image_thumb_storage_path: ${error.message}`
              : "Invalid site_image_thumb_storage_path."
        });
      }

      if (!siteImageThumbStoragePath.startsWith(`${user.id}/`)) {
        return safeJson(403, {
          error: "site_image_thumb_storage_path must be scoped to the authenticated user."
        });
      }
      stagedStoragePaths.add(siteImageThumbStoragePath);
    }

    if (rawOgImageStoragePath) {
      try {
        ogImageStoragePath = normalizeStoragePath(rawOgImageStoragePath);
      } catch (error) {
        return safeJson(400, {
          error:
            error instanceof Error
              ? `Invalid og_image_storage_path: ${error.message}`
              : "Invalid og_image_storage_path."
        });
      }

      if (!ogImageStoragePath.startsWith(`${user.id}/`)) {
        return safeJson(403, {
          error: "og_image_storage_path must be scoped to the authenticated user."
        });
      }
      stagedStoragePaths.add(ogImageStoragePath);
    }

    const createSiteStorageId = siteId && siteId.length > 0 ? siteId : crypto.randomUUID();
    const stageImage = async ({
      contentB64,
      storagePath,
      repoPath,
      fallbackFilename,
      label
    }: {
      contentB64: string | undefined;
      storagePath: string;
      repoPath: string | undefined;
      fallbackFilename: string;
      label: string;
    }) => {
      if (!contentB64 || storagePath) {
        return storagePath;
      }

      let imageBuffer: Buffer;
      try {
        imageBuffer = decodeImageBase64(contentB64, label);
      } catch (error) {
        return safeJson(400, { error: error instanceof Error ? error.message : `${label} is invalid.` });
      }

      const filename = getFilenameFromRepoPath(repoPath ?? "", fallbackFilename);
      const nextStoragePath = `${user.id}/create-site/${createSiteStorageId}/${filename}`;
      const { error: stageUploadError } = await supabase.storage
        .from(SITE_DRAFT_IMAGES_BUCKET)
        .upload(nextStoragePath, imageBuffer, {
          upsert: true,
          contentType: "image/jpeg"
        });

      if (stageUploadError) {
        return safeJson(500, { error: stageUploadError.message });
      }

      stagedStoragePaths.add(nextStoragePath);
      return nextStoragePath;
    };

    const stagedSiteImageResult = await stageImage({
      contentB64: siteImageContentB64,
      storagePath: siteImageStoragePath,
      repoPath: siteImagePath,
      fallbackFilename: "site-image.jpg",
      label: "site_image_content_b64"
    });
    if (typeof stagedSiteImageResult !== "string") {
      await cleanupStagedSiteImages();
      return stagedSiteImageResult;
    }
    siteImageStoragePath = stagedSiteImageResult;

    const stagedThumbResult = await stageImage({
      contentB64: siteImageThumbContentB64,
      storagePath: siteImageThumbStoragePath,
      repoPath: siteImageThumbPath,
      fallbackFilename: "site-image_thumb.jpg",
      label: "site_image_thumb_content_b64"
    });
    if (typeof stagedThumbResult !== "string") {
      await cleanupStagedSiteImages();
      return stagedThumbResult;
    }
    siteImageThumbStoragePath = stagedThumbResult;

    const stagedOgResult = await stageImage({
      contentB64: ogImageContentB64,
      storagePath: ogImageStoragePath,
      repoPath: ogImagePath,
      fallbackFilename: "og-home.jpg",
      label: "og_image_content_b64"
    });
    if (typeof stagedOgResult !== "string") {
      await cleanupStagedSiteImages();
      return stagedOgResult;
    }
    ogImageStoragePath = stagedOgResult;

    const { data: job, error: insertError } = await supabase
      .from("repo_provision_jobs")
      .insert({
        owner_user_id: user.id,
        status: "queued",
        step: "Queued for repository creation..."
      })
      .select("id,status,step")
      .single();

    if (insertError || !job?.id) {
      await cleanupStagedSiteImages();
      return safeJson(500, {
        error: insertError?.message ?? "Failed to create provisioning job."
      });
    }

    const origin = resolveOrigin(event);
    const workerUrl = new URL(WORKER_PATH, origin).toString();

    let dispatchResponse: Response;
    try {
      dispatchResponse = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-provision-internal-key": CREATE_SITE_SUPABASE_API_KEY
        },
        body: JSON.stringify({
          jobId: job.id,
          ownerUserId: user.id,
          name,
          description,
          private: isPrivate,
          siteId,
          siteTitle,
          siteDescription,
          siteImagePath,
          siteImageStoragePath,
          siteImageThumbPath,
          siteImageThumbStoragePath,
          siteImageThumbContentB64: siteImageThumbStoragePath ? undefined : siteImageThumbContentB64,
          ogImagePath,
          ogImageStoragePath,
          ogImageContentB64: ogImageStoragePath ? undefined : ogImageContentB64
        })
      });
    } catch (error) {
      const dispatchMessage =
        error instanceof Error ? error.message : "Failed to dispatch background provisioning worker.";
      await supabase
        .from("repo_provision_jobs")
        .update({
          status: "failed",
          step: "Failed to start background provisioning worker.",
          error: dispatchMessage,
          completed_at: new Date().toISOString()
        })
        .eq("id", job.id)
        .eq("owner_user_id", user.id);
      await cleanupStagedSiteImages();

      return safeJson(500, { error: dispatchMessage });
    }

    if (![200, 202].includes(dispatchResponse.status)) {
      const rawDispatchBody = await dispatchResponse.text().catch(() => "");
      let dispatchMessage = `Background worker dispatch failed with status ${dispatchResponse.status}.`;

      if (rawDispatchBody.trim()) {
        try {
          const dispatchPayload = JSON.parse(rawDispatchBody) as { error?: string };
          const payloadMessage = dispatchPayload.error?.trim() ?? "";
          if (payloadMessage) {
            dispatchMessage = payloadMessage;
          }
        } catch {
          const normalizedBody = rawDispatchBody.trim().slice(0, 300);
          dispatchMessage = `Background worker dispatch failed with status ${dispatchResponse.status}: ${normalizedBody}`;
        }
      }

      await supabase
        .from("repo_provision_jobs")
        .update({
          status: "failed",
          step: "Failed to start background provisioning worker.",
          error: dispatchMessage,
          completed_at: new Date().toISOString()
        })
        .eq("id", job.id)
        .eq("owner_user_id", user.id);
      await cleanupStagedSiteImages();

      return safeJson(500, { error: dispatchMessage });
    }

    return safeJson(200, {
      job: {
        id: job.id,
        status: job.status,
        step: job.step
      }
    });
  } catch (error) {
    await cleanupStagedSiteImages();
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};


Deno.serve((request) => runHandler(request, handler));
