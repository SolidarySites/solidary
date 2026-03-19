import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SOLIDARY_SECRET_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

type RepoProvisionStatusBody = {
  job_id?: string;
  supabase_access_token?: string;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const parseBody = (rawBody: string | null): RepoProvisionStatusBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as RepoProvisionStatusBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  if (!SUPABASE_URL || !SOLIDARY_SECRET_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key."
    });
  }

  let body: RepoProvisionStatusBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload."
    });
  }

  const jobId = body.job_id?.trim();
  const supabaseAccessToken = body.supabase_access_token?.trim();
  if (!jobId || !supabaseAccessToken) {
    return safeJson(400, {
      error: "Missing job_id or supabase_access_token."
    });
  }

  const supabase = createClient(SUPABASE_URL, SOLIDARY_SECRET_KEY, {
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

    const { data: job, error: jobError } = await supabase
      .from("repo_provision_jobs")
      .select("id, status, step, error, repo_payload, created_at, updated_at, started_at, completed_at")
      .eq("id", jobId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (jobError) {
      return safeJson(500, {
        error: jobError.message
      });
    }

    if (!job) {
      return safeJson(404, {
        error: "Provisioning job not found."
      });
    }

    return safeJson(200, {
      job: {
        id: job.id,
        status: job.status,
        step: job.step,
        error: job.error,
        repo: job.repo_payload,
        created_at: job.created_at,
        updated_at: job.updated_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      }
    });
  } catch (error) {
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};


Deno.serve((request) => runHandler(request, handler));
