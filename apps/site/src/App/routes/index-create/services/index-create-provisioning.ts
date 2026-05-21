import { githubRequest } from "../../../services/github";
import { supabaseFunctionUrl } from "../../../lib/supabase";
import {
  BYTES_100_KB,
  BYTES_1_MB
} from "../../../services/image-processing/picsquish";
import { prepareCreationImage } from "../../../services/image-processing/creation-images";
import type { IndexProvisionStartResponse, IndexProvisionStatusResponse } from "./types";

const POLL_DELAYS_MS = [1500, 1500, 2000, 2500, 3000, 4000, 5000];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const createImageStagingId = (slug: string) => {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${slug}-${randomPart}`;
};

const INDEX_CREATE_IMAGE_VARIANTS = [
  {
    key: "indexImage",
    label: "Index image",
    maxBytes: BYTES_1_MB
  },
  {
    key: "indexImageThumb",
    label: "Index thumbnail",
    maxBytes: BYTES_100_KB
  }
] as const;

export const REQUIRED_SUPABASE_MANAGEMENT_SCOPES = [
  "organizations:read",
  "projects:read",
  "projects:write",
  "database:write",
  "edge_functions:write",
  "secrets:read",
  "secrets:write"
] as const;

export const hasRequiredSupabaseManagementScopes = (grantedScopes: string[]) => {
  // Supabase may omit the `scope` field on token exchange responses even when
  // the authorized token can access the required Management API endpoints.
  if (!grantedScopes.length) {
    return true;
  }

  const granted = new Set(grantedScopes.map((entry) => entry.trim().toLowerCase()).filter(Boolean));
  return REQUIRED_SUPABASE_MANAGEMENT_SCOPES.every((scope) => granted.has(scope));
};

export const startIndexProvisioning = async ({
  supabaseAccessToken,
  slug,
  title,
  description,
  organizationId,
  ownerUserId,
  image
}: {
  supabaseAccessToken: string;
  slug: string;
  title: string;
  description: string;
  organizationId: string;
  ownerUserId: string;
  image?: File | null;
}) => {
  if (image && image.type && !image.type.startsWith("image/")) {
    throw new Error("Index image must be an image file.");
  }

  let imageContentB64: string | undefined;
  let imageThumbContentB64: string | undefined;
  let imageOriginalStoragePath: string | undefined;
  let imageOriginalMimeType: string | undefined;
  if (image) {
    const preparedImage = await prepareCreationImage({
      file: image,
      ownerUserId,
      stagingFolder: "create-index",
      stagingId: createImageStagingId(slug),
      variants: INDEX_CREATE_IMAGE_VARIANTS,
      jpegQuality: 0.9,
      jpegDpi: 72
    });

    if (preparedImage.mode === "optimized") {
      imageContentB64 = preparedImage.imagesB64.indexImage;
      imageThumbContentB64 = preparedImage.imagesB64.indexImageThumb;
    } else {
      imageOriginalStoragePath = preparedImage.originalStoragePath;
      imageOriginalMimeType = preparedImage.originalMimeType;
    }
  }

  const response = await fetch(supabaseFunctionUrl("index-create"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: slug,
      title,
      description,
      organization_id: organizationId,
      image_content_b64: imageContentB64,
      image_thumb_content_b64: imageThumbContentB64,
      image_original_storage_path: imageOriginalStoragePath,
      image_original_mime_type: imageOriginalMimeType
    })
  });

  const payload = (await response.json().catch(() => ({}))) as IndexProvisionStartResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not start index provisioning.");
  }

  const jobId = payload.job?.id?.trim() ?? "";
  if (!jobId) {
    throw new Error("Index provisioning job did not return an id.");
  }

  return {
    jobId,
    initialStep: payload.job?.step?.trim() || "Preparing your index..."
  };
};

export const waitForIndexProvisioningJob = async ({
  jobId,
  supabaseAccessToken,
  onStep
}: {
  jobId: string;
  supabaseAccessToken: string;
  onStep: (value: string) => void;
}) => {
  let attempt = 0;

  for (;;) {
    const payload = await githubRequest<IndexProvisionStatusResponse>("index-create-status", {
      job_id: jobId,
      supabase_access_token: supabaseAccessToken
    });

    const job = payload.job;
    if (!job) {
      throw new Error("Missing index provisioning job payload.");
    }

    const step = job.step?.trim();
    if (step) {
      onStep(step);
    }

    if (job.status === "succeeded") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error?.trim() || "Index provisioning failed.");
    }

    const delay = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] ?? 5000;
    attempt += 1;
    await sleep(delay);
  }
};
