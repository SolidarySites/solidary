import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  buildStandaloneAdminSetup,
  isIndexFinalizationJobStale,
  parseBearerToken,
  parseBridgeTokenFromEvent,
  readIndexAdminState,
  readLatestIndexFinalizationJob,
  removeIndexCollaborator,
  resolveIndexAdminContext,
  resolveParentSourceRepo,
  updateIndexAdvancedSettings,
  updateIndexConnectionStatus,
  updateIndexGeneralSettings,
  upsertIndexCollaborator,
} from "../_shared/index-admin.ts";

type WriteAction =
  | "update_general"
  | "set_connection_status"
  | "upsert_collaborator"
  | "remove_collaborator"
  | "update_advanced"
  | "finalize_index";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("DELETE_REPO_SUPABASE_SECRET_KEY") ??
  Deno.env.get("CREATE_SITE_SUPABASE_API_KEY") ?? "";
const FINALIZE_WORKER_PATH = "/functions/v1/index-finalize-worker-background";

const safeJson = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (rawBody: string | null): Record<string, unknown> => {
  try {
    return (JSON.parse(rawBody ?? "{}") ?? {}) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const isWriteAction = (value: unknown): value is WriteAction =>
  value === "update_general" ||
  value === "set_connection_status" ||
  value === "upsert_collaborator" ||
  value === "remove_collaborator" ||
  value === "update_advanced" ||
  value === "finalize_index";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = parseBody(event.body);
    const archiveId = typeof body.archive_id === "string"
      ? body.archive_id.trim()
      : "";
    const action = isWriteAction(body.action) ? body.action : null;
    if (!archiveId || !action) {
      return safeJson(400, { error: "Missing archive_id or action." });
    }

    const context = await resolveIndexAdminContext({
      archiveId,
      supabaseAccessToken: (typeof body.supabase_access_token === "string"
        ? body.supabase_access_token
        : "") ||
        parseBearerToken(
          event.headers.authorization ?? event.headers.Authorization,
        ),
      bridgeToken: parseBridgeTokenFromEvent(event, body),
    });

    if (action === "update_general") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string"
        ? body.description.trim()
        : "";
      if (!title || !description) {
        return safeJson(400, { error: "Missing title or description." });
      }
      await updateIndexGeneralSettings({
        context,
        title,
        description,
        imageContentB64: typeof body.image_content_b64 === "string"
          ? body.image_content_b64.trim()
          : undefined,
      });
    } else if (action === "set_connection_status") {
      const siteId = typeof body.site_id === "string"
        ? body.site_id.trim()
        : "";
      const status = body.status === "delisted" ? "delisted" : "tracked";
      if (!siteId) {
        return safeJson(400, { error: "Missing site_id." });
      }
      await updateIndexConnectionStatus({
        context,
        siteId,
        status,
      });
    } else if (action === "upsert_collaborator") {
      const collaboratorUserId = typeof body.collaborator_user_id === "string"
        ? body.collaborator_user_id.trim()
        : "";
      const role = body.role;
      if (!collaboratorUserId) {
        return safeJson(400, { error: "Missing collaborator_user_id." });
      }
      if (role !== "admin" && role !== "editor" && role !== "contributor") {
        return safeJson(400, { error: "Missing valid collaborator role." });
      }
      await upsertIndexCollaborator({
        context,
        collaboratorUserId,
        role,
      });
    } else if (action === "remove_collaborator") {
      const collaboratorUserId = typeof body.collaborator_user_id === "string"
        ? body.collaborator_user_id.trim()
        : "";
      if (!collaboratorUserId) {
        return safeJson(400, { error: "Missing collaborator_user_id." });
      }
      await removeIndexCollaborator({
        context,
        collaboratorUserId,
      });
    } else if (action === "update_advanced") {
      await updateIndexAdvancedSettings({
        context,
        domain: typeof body.domain === "string" ? body.domain.trim() : null,
      });
    } else if (action === "finalize_index") {
      if (context.actorRole !== "owner") {
        throw new Error("Only the owner can finalize the index.");
      }
      const existingJob = await readLatestIndexFinalizationJob({
        supabase: context.supabase,
        archiveId,
      });
      if (existingJob && isIndexFinalizationJobStale(existingJob)) {
        const { error: staleJobError } = await context.supabase
          .from("index_finalization_jobs")
          .update({
            status: "failed",
            step: "Index finalization stalled.",
            error:
              "The previous finalization job stopped reporting progress. Retry finalization.",
            completed_at: new Date().toISOString(),
          })
          .eq("id", existingJob.id)
          .eq("archive_id", archiveId);
        if (staleJobError) {
          throw new Error(staleJobError.message);
        }
      }
      if (
        existingJob &&
        !isIndexFinalizationJobStale(existingJob) &&
        (existingJob.status === "queued" || existingJob.status === "running")
      ) {
        throw new Error("Index finalization is already running.");
      }
      if (context.archive.runtime_mode === "finalized") {
        throw new Error("This index has already been finalized.");
      }
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        throw new Error("Missing SUPABASE_URL or internal worker key.");
      }
      const currentState = await readIndexAdminState(context);
      const parentSource = resolveParentSourceRepo({
        archive: context.archive,
        childArchive: {
          parent_index_id: currentState.archive.parentIndexId,
          parent_index_url: currentState.archive.parentIndexUrl,
          parent_repo_full_name: currentState.archive.parentRepoFullName,
          parent_repo_url: currentState.archive.parentRepoUrl,
        },
      });
      if (!parentSource.repoFullName) {
        throw new Error(
          parentSource.message ??
            "The parent source repository is not configured for this index.",
        );
      }

      const { data: jobData, error: jobError } = await context.supabase
        .from("index_finalization_jobs")
        .insert({
          archive_id: archiveId,
          owner_user_id: context.actorUserId,
          status: "queued",
          step: "Queued",
          source_repo_full_name: parentSource.repoFullName,
          source_repo_url: parentSource.repoUrl,
          target_repo_full_name: context.credentials.repo_full_name,
          child_project_ref: context.credentials.supabase_project_ref,
          payload: {
            source_repo_resolution: parentSource.sourceKind,
          },
        })
        .select("id")
        .single();
      if (jobError || !jobData?.id) {
        throw new Error(
          jobError?.message ?? "Could not queue index finalization.",
        );
      }

      const workerResponse = await fetch(
        new URL(FINALIZE_WORKER_PATH, SUPABASE_URL).toString(),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-provision-internal-key": SUPABASE_SERVICE_KEY,
          },
          body: JSON.stringify({
            jobId: jobData.id,
            archiveId,
            ownerUserId: context.actorUserId,
          }),
        },
      );
      if (!workerResponse.ok) {
        const payload = await workerResponse.json().catch(() => ({}));
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Could not start index finalization worker.",
        );
      }
    }

    const state = await readIndexAdminState(context);
    const latestJob = await readLatestIndexFinalizationJob({
      supabase: context.supabase,
      archiveId,
    });
    return safeJson(200, {
      state,
      setup: buildStandaloneAdminSetup({
        context,
        state,
        latestJob,
      }),
    });
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error
        ? error.message
        : "Could not save index admin changes.",
    });
  }
};

Deno.serve((request) => runHandler(request, handler));
