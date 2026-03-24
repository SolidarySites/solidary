import { createClient } from "npm:@supabase/supabase-js@2.93.3";
import { randomBytes } from "node:crypto";

type SupabaseClientLike = any;

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toFiniteInt = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const normalized = toTrimmedString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const createFederationSharedSecret = () =>
  randomBytes(32).toString("base64url");

const createAdminClient = (projectUrl: string, secretKey: string) =>
  createClient(projectUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const upsertFederationPeer = async ({
  supabase,
  localIndexId,
  remoteIndexId,
  remoteProjectUrl,
  remotePublishableKey,
  sharedSecret,
  relationship,
}: {
  supabase: SupabaseClientLike;
  localIndexId: string;
  remoteIndexId: string;
  remoteProjectUrl: string;
  remotePublishableKey: string;
  sharedSecret: string;
  relationship: "parent" | "child";
}) => {
  const { error } = await supabase.from("index_federation_peers").upsert({
    local_index_id: localIndexId,
    remote_index_id: remoteIndexId,
    remote_project_url: remoteProjectUrl,
    remote_publishable_key: remotePublishableKey,
    shared_secret: sharedSecret,
    relationship,
    is_active: true,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const ensureFederationPeerPair = async ({
  parentSupabase,
  parentIndexId,
  parentProjectUrl,
  parentPublishableKey,
  childProjectUrl,
  childPublishableKey,
  childSecretKey,
  childIndexId,
}: {
  parentSupabase: SupabaseClientLike;
  parentIndexId: string;
  parentProjectUrl: string;
  parentPublishableKey: string;
  childProjectUrl: string;
  childPublishableKey: string;
  childSecretKey: string;
  childIndexId: string;
}) => {
  const sharedSecret = createFederationSharedSecret();
  const childSupabase = createAdminClient(childProjectUrl, childSecretKey);

  await Promise.all([
    upsertFederationPeer({
      supabase: parentSupabase,
      localIndexId: parentIndexId,
      remoteIndexId: childIndexId,
      remoteProjectUrl: childProjectUrl,
      remotePublishableKey: childPublishableKey,
      sharedSecret,
      relationship: "child",
    }),
    upsertFederationPeer({
      supabase: childSupabase,
      localIndexId: childIndexId,
      remoteIndexId: parentIndexId,
      remoteProjectUrl: parentProjectUrl,
      remotePublishableKey: parentPublishableKey,
      sharedSecret,
      relationship: "parent",
    }),
  ]);
};

export const enqueueAuthoritativeFederationSnapshot = async ({
  supabase,
  targetRemoteIndexId,
}: {
  supabase: SupabaseClientLike;
  targetRemoteIndexId?: string | null;
}) => {
  const { data, error } = await supabase.rpc(
    "index_federation_enqueue_authoritative_snapshot",
    {
      p_target_remote_index_id: targetRemoteIndexId ?? null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return toFiniteInt(data, 0);
};

export const dispatchFederationQueueNow = async ({
  supabase,
}: {
  supabase: SupabaseClientLike;
}) => {
  const { error: recoverError } = await supabase.rpc(
    "index_federation_recover_orphaned_deliveries",
  );
  if (recoverError) {
    throw new Error(recoverError.message);
  }

  const { error: dispatchError } = await supabase.rpc(
    "index_federation_dispatch_due_deliveries",
    {
      p_limit: 50,
    },
  );
  if (dispatchError) {
    throw new Error(dispatchError.message);
  }

  const { error: reconcileError } = await supabase.rpc(
    "index_federation_reconcile_deliveries",
  );
  if (reconcileError) {
    throw new Error(reconcileError.message);
  }

  return true;
};
