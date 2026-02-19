import type { Handler } from "@netlify/functions";
import {
  createSupabaseAdmin,
  ensureNodeSyncSecretEnv,
  ensureSupabaseEnv,
  hasValidNodeSyncSecret,
  parseBody,
  safeJson
} from "./protocol-contract";

type ProtocolInboxApplyBody = {
  envelope_id?: string;
  status?: string;
  processor?: string;
  error_code?: string;
  error_message?: string;
  details?: Record<string, unknown>;
};

const TERMINAL_STATUS_SET = new Set(["applied", "failed", "rejected", "expired", "skipped"]);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return safeJson(405, { error: "Method not allowed." });
  }

  const envError = ensureSupabaseEnv() ?? ensureNodeSyncSecretEnv();
  if (envError) {
    return safeJson(500, { error: envError });
  }

  if (!hasValidNodeSyncSecret(event.headers["x-solidary-node-secret"])) {
    return safeJson(403, {
      error: "Invalid node sync secret.",
      code: "invalid_node_sync_secret"
    });
  }

  let body: ProtocolInboxApplyBody;
  try {
    body = parseBody<ProtocolInboxApplyBody>(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
      code: "invalid_json"
    });
  }

  const envelopeId = (body.envelope_id ?? "").trim();
  const status = (body.status ?? "").trim().toLowerCase();
  const processor = (body.processor ?? "node-worker").trim();
  const errorCode = body.error_code?.trim() || null;
  const errorMessage = body.error_message?.trim() || null;
  const details = body.details ?? {};

  if (!envelopeId) {
    return safeJson(400, {
      error: "envelope_id is required.",
      code: "missing_envelope_id"
    });
  }

  if (!TERMINAL_STATUS_SET.has(status)) {
    return safeJson(400, {
      error: "status must be one of: applied, failed, rejected, expired, skipped.",
      code: "invalid_status"
    });
  }

  if (!processor) {
    return safeJson(400, {
      error: "processor is required.",
      code: "missing_processor"
    });
  }

  const supabase = createSupabaseAdmin();
  const { data: inboxId, error: markError } = await supabase.rpc(
    "rpc_protocol_mark_command_result",
    {
      p_envelope_id: envelopeId,
      p_status: status,
      p_processor: processor,
      p_error_code: errorCode,
      p_error_message: errorMessage,
      p_details: details
    }
  );

  if (markError) {
    return safeJson(500, {
      error: markError.message,
      code: "mark_result_failed"
    });
  }

  return safeJson(200, {
    inbox_id: inboxId,
    envelope_id: envelopeId,
    status
  });
};
