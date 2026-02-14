import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const CREATE_SITE_SUPABASE_API_KEY = process.env.CREATE_SITE_SUPABASE_API_KEY ?? "";
const WORKER_PATH = "/.netlify/functions/github-create-repo-worker-background";

type StartRepoProvisionBody = {
  token?: string;
  name?: string;
  description?: string;
  private?: boolean;
  supabase_access_token?: string;
  site_id?: string;
  site_title?: string;
  site_description?: string;
  site_image_path?: string;
  site_image_content_b64?: string;
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

  const userToken = body.token?.trim();
  const name = body.name?.trim();
  const description = typeof body.description === "string" ? body.description : "";
  const isPrivate = body.private === undefined ? false : Boolean(body.private);
  const supabaseAccessToken = body.supabase_access_token?.trim();
  const siteId = body.site_id?.trim();
  const siteTitle = body.site_title?.trim();
  const siteDescription = body.site_description?.trim();
  const siteImagePath = body.site_image_path?.trim();

  if (!userToken || !name || !supabaseAccessToken) {
    return safeJson(400, {
      error: "Missing token, name, or supabase_access_token."
    });
  }

  const supabase = createClient(SUPABASE_URL, CREATE_SITE_SUPABASE_API_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(supabaseAccessToken);

    if (userError || !user) {
      return safeJson(401, { error: "Invalid Supabase session." });
    }

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
          token: userToken,
          name,
          description,
          private: isPrivate,
          siteId,
          siteTitle,
          siteDescription,
          siteImagePath
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
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
