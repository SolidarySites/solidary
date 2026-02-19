import type { Handler } from "@netlify/functions";
import {
  createSupabaseAdmin,
  ensureSupabaseEnv,
  getBearerToken,
  parseBody,
  safeJson
} from "./protocol-contract";

type IndexCreateBody = {
  node_slug?: string;
  node_title?: string;
  node_kind?: string;
};

const NODE_SLUG_REGEX = /^[a-z0-9-]{3,64}$/;
const NODE_KIND_SET = new Set(["index", "archive", "library", "catalog", "custom"]);

const normalizeNodeSlug = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeNodeTitle = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeNodeKind = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "index";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return safeJson(405, { error: "Method not allowed." });
  }

  const envError = ensureSupabaseEnv();
  if (envError) {
    return safeJson(500, { error: envError });
  }

  const supabase = createSupabaseAdmin();
  const bearerToken = getBearerToken(event.headers.authorization);

  if (!bearerToken) {
    return safeJson(401, {
      error: "Missing bearer token.",
      code: "missing_bearer_token"
    });
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(bearerToken);

  if (userError || !user) {
    return safeJson(401, {
      error: "Invalid Supabase session.",
      code: "invalid_session"
    });
  }

  let body: IndexCreateBody;
  try {
    body = parseBody<IndexCreateBody>(event.body);
  } catch (error) {
    return safeJson(400, {
      error: error instanceof Error ? error.message : "Invalid payload.",
      code: "invalid_json"
    });
  }

  const nodeSlug = normalizeNodeSlug(body.node_slug);
  const nodeTitle = normalizeNodeTitle(body.node_title);
  const nodeKind = normalizeNodeKind(body.node_kind);

  if (!NODE_SLUG_REGEX.test(nodeSlug)) {
    return safeJson(400, {
      error: "node_slug must match ^[a-z0-9-]{3,64}$.",
      code: "invalid_node_slug"
    });
  }

  if (!nodeTitle) {
    return safeJson(400, {
      error: "node_title is required.",
      code: "missing_node_title"
    });
  }

  if (!NODE_KIND_SET.has(nodeKind)) {
    return safeJson(400, {
      error: "node_kind must be one of: index, archive, library, catalog, custom.",
      code: "invalid_node_kind"
    });
  }

  const { data: nodeData, error: bootstrapError } = await supabase.rpc(
    "rpc_protocol_bootstrap_node_contract",
    {
      p_node_slug: nodeSlug,
      p_node_title: nodeTitle,
      p_owner_user_id: user.id,
      p_node_kind: nodeKind
    }
  );

  if (bootstrapError) {
    return safeJson(500, {
      error: bootstrapError.message,
      code: "bootstrap_failed"
    });
  }

  return safeJson(200, {
    node: nodeData,
    required_public_paths: [
      "/.well-known/solidary-links.json",
      "/solidary-media/site-image.jpeg"
    ],
    sync_endpoints: {
      node_sync: "/.netlify/functions/node-sync",
      protocol_inbox_apply: "/.netlify/functions/protocol-inbox-apply"
    }
  });
};
