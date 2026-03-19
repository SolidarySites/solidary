import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SOLIDARY_SECRET_KEY") ?? "";

type IndexProvisionStatusBody = {
  job_id?: string;
  supabase_access_token?: string;
};

type IndexProvisionJobRow = {
  id: string;
  status: string;
  step: string;
  error: string | null;
  repo_payload: unknown;
  project_payload: unknown;
  archive_payload: unknown;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): IndexProvisionStatusBody => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as IndexProvisionStatusBody;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return safeJson(500, {
      error: "Missing SUPABASE_URL or Supabase service key.",
    });
  }

  let body: IndexProvisionStatusBody;
  try {
    body = parseBody(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
    });
  }

  const jobId = body.job_id?.trim();
  const supabaseAccessToken = body.supabase_access_token?.trim();
  if (!jobId || !supabaseAccessToken) {
    return safeJson(400, {
      error: "Missing job_id or supabase_access_token.",
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(supabaseAccessToken);
  if (userError || !user) {
    return safeJson(401, { error: "Invalid Supabase session." });
  }

  const { data: rawJob, error: jobError } = await supabase
    .from("index_provision_jobs")
    .select(
      [
        "id",
        "status",
        "step",
        "error",
        "repo_payload",
        "project_payload",
        "archive_payload",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
      ].join(", "),
    )
    .eq("id", jobId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  const job = rawJob as IndexProvisionJobRow | null;

  if (jobError) {
    return safeJson(500, {
      error: jobError.message,
    });
  }

  if (!job) {
    return safeJson(404, {
      error: "Provisioning job not found.",
    });
  }

  return safeJson(200, {
    job: {
      id: job.id,
      status: job.status,
      step: job.step,
      error: job.error,
      repo: job.repo_payload,
      project: job.project_payload,
      archive: job.archive_payload,
      created_at: job.created_at,
      updated_at: job.updated_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
    },
  });
};

Deno.serve((request) => runHandler(request, handler));
