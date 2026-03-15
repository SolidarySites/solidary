import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  buildStandaloneAdminSetup,
  parseBearerToken,
  parseBridgeTokenFromEvent,
  readIndexAdminState,
  removeIndexCollaborator,
  resolveIndexAdminContext,
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
  | "update_advanced";

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
  value === "update_advanced";

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
    }

    const state = await readIndexAdminState(context);
    return safeJson(200, {
      state,
      setup: buildStandaloneAdminSetup({
        context,
        state,
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
