import { githubRequest } from "../../../services/github";
import { supabaseFunctionUrl } from "../../../lib/supabase";
import type { IndexProvisionStartResponse, IndexProvisionStatusResponse } from "./types";

const POLL_DELAYS_MS = [1500, 1500, 2000, 2500, 3000, 4000, 5000];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const REQUIRED_SUPABASE_MANAGEMENT_SCOPES = [
  "organizations:read",
  "projects:read",
  "projects:write",
  "database:write",
  "secrets:read",
  "secrets:write"
] as const;

export const hasRequiredSupabaseManagementScopes = (grantedScopes: string[]) => {
  const granted = new Set(grantedScopes.map((entry) => entry.trim().toLowerCase()).filter(Boolean));
  return REQUIRED_SUPABASE_MANAGEMENT_SCOPES.every((scope) => granted.has(scope));
};

export const startIndexProvisioning = async ({
  supabaseAccessToken,
  slug,
  title,
  description,
  organizationId,
  imageContentB64
}: {
  supabaseAccessToken: string;
  slug: string;
  title: string;
  description: string;
  organizationId: string;
  imageContentB64?: string;
}) => {
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
      image_content_b64: imageContentB64
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
