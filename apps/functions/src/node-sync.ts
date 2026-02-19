import type { Handler } from "@netlify/functions";
import {
  createSupabaseAdmin,
  ensureNodeSyncSecretEnv,
  ensureSupabaseEnv,
  hasValidNodeSyncSecret,
  parseBody,
  safeJson
} from "./protocol-contract";

type NodeSyncBody = {
  limit?: number;
  include_payload?: boolean;
};

type PendingCommand = {
  envelope_id?: unknown;
  command_type?: unknown;
  command_version?: unknown;
  issued_at?: unknown;
  not_before_at?: unknown;
  expires_at?: unknown;
  issuer?: unknown;
  key_id?: unknown;
  signature?: unknown;
  payload?: unknown;
  payload_hash?: unknown;
};

const toSafePendingCommand = (value: PendingCommand, includePayload: boolean) => {
  const base = {
    envelope_id: typeof value.envelope_id === "string" ? value.envelope_id : "",
    command_type: typeof value.command_type === "string" ? value.command_type : "",
    command_version: typeof value.command_version === "number" ? value.command_version : 0,
    issued_at: typeof value.issued_at === "string" ? value.issued_at : null,
    not_before_at: typeof value.not_before_at === "string" ? value.not_before_at : null,
    expires_at: typeof value.expires_at === "string" ? value.expires_at : null,
    issuer: typeof value.issuer === "string" ? value.issuer : "",
    key_id: typeof value.key_id === "string" ? value.key_id : "",
    payload_hash: typeof value.payload_hash === "string" ? value.payload_hash : ""
  };

  if (!includePayload) {
    return {
      ...base,
      payload: null,
      signature: null
    };
  }

  return {
    ...base,
    payload: value.payload ?? {},
    signature: typeof value.signature === "string" ? value.signature : ""
  };
};

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

  let body: NodeSyncBody;
  try {
    body = parseBody<NodeSyncBody>(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
      code: "invalid_json"
    });
  }

  const limitValue = Number.isFinite(body.limit) ? Number(body.limit) : 20;
  const limit = Math.max(1, Math.min(200, Math.trunc(limitValue)));
  const includePayload = body.include_payload === undefined ? true : Boolean(body.include_payload);

  const supabase = createSupabaseAdmin();
  const { data: pendingData, error: pendingError } = await supabase.rpc(
    "rpc_protocol_list_pending_commands",
    {
      p_limit: limit
    }
  );

  if (pendingError) {
    return safeJson(500, {
      error: pendingError.message,
      code: "pending_commands_failed"
    });
  }

  const pendingItems = Array.isArray(pendingData)
    ? pendingData.map((entry) => toSafePendingCommand((entry ?? {}) as PendingCommand, includePayload))
    : [];

  return safeJson(200, {
    synced_at: new Date().toISOString(),
    pending_count: pendingItems.length,
    pending: pendingItems
  });
};
