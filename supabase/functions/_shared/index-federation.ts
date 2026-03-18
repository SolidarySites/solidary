type FederationIndexState = {
  id: string;
  slug: string;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  updatedAt: string | null;
  runtimeMode: "scaffold" | "finalized";
  indexLevel: number | null;
  parentIndexId: string | null;
  parentIndexUrl: string | null;
  parentIndexLevel: number | null;
  parentRepoFullName: string | null;
  parentRepoUrl: string | null;
  repoFullName: string | null;
  repoUrl: string | null;
  finalizedAt: string | null;
  projectUrl: string;
  publishableKey: string;
};

type FederationMembershipState = {
  siteId: string;
  canonicalUrl: string;
  title: string;
  description: string;
  imageUrl: string;
  updatedAt: string | null;
  trackedAt: string | null;
};

export type FederationState = {
  index: FederationIndexState | null;
  memberships: FederationMembershipState[];
  connection: {
    projectUrl: string;
    publishableKey: string;
  } | null;
};

export type FederationRefreshResult = {
  archiveId: string | null;
  membershipCount: number;
  skipped: boolean;
  reason: string | null;
};

type LocalSupabaseClient = any;

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toNullableString = (value: unknown) => {
  const normalized = toTrimmedString(value);
  return normalized || null;
};

const toNullableInt = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const normalized = toTrimmedString(value);
  if (!normalized) return null;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const toAbsoluteProjectUrl = (projectUrl: string) => {
  try {
    const parsed = new URL(projectUrl);
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Invalid Supabase project URL.");
  }
};

const buildRpcUrl = (projectUrl: string, path: string) =>
  new URL(path, `${toAbsoluteProjectUrl(projectUrl)}/`).toString();

const describeHttpFailure = async (
  response: Response,
  fallbackMessage: string,
) => {
  const payload = await response.text().catch(() => "");
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(trimmedPayload) as Record<string, unknown>;
    const message = toTrimmedString(parsed.message) ||
      toTrimmedString(parsed.error) ||
      toTrimmedString(parsed.msg);
    if (message) {
      return `${fallbackMessage} (${message})`;
    }
  } catch {
    // Ignore JSON parsing failures and fall back to the raw body below.
  }

  return `${fallbackMessage} (${trimmedPayload})`;
};

const normalizeFederationState = ({
  payload,
  fallbackProjectUrl,
  fallbackPublishableKey,
}: {
  payload: unknown;
  fallbackProjectUrl: string;
  fallbackPublishableKey: string;
}): FederationState => {
  const record = asRecord(payload) ?? {};
  const connectionRecord = asRecord(record.connection) ?? {};
  const connectionProjectUrl =
    toTrimmedString(connectionRecord.project_url) || fallbackProjectUrl;
  const connectionPublishableKey =
    toTrimmedString(connectionRecord.publishable_key) || fallbackPublishableKey;

  const indexRecord = asRecord(record.index);
  const normalizedIndex = indexRecord
    ? {
      id: toTrimmedString(indexRecord.id),
      slug: toTrimmedString(indexRecord.slug),
      title: toTrimmedString(indexRecord.title) || "Untitled index",
      description: toTrimmedString(indexRecord.description),
      canonicalUrl: toTrimmedString(indexRecord.canonical_url),
      imageUrl: toTrimmedString(indexRecord.image_url),
      updatedAt: toNullableString(indexRecord.updated_at),
      runtimeMode:
        toTrimmedString(indexRecord.runtime_mode) === "finalized"
          ? "finalized"
          : "scaffold",
      indexLevel: toNullableInt(indexRecord.index_level),
      parentIndexId: toNullableString(indexRecord.parent_index_id),
      parentIndexUrl: toNullableString(indexRecord.parent_index_url),
      parentIndexLevel: toNullableInt(indexRecord.parent_index_level),
      parentRepoFullName: toNullableString(indexRecord.parent_repo_full_name),
      parentRepoUrl: toNullableString(indexRecord.parent_repo_url),
      repoFullName: toNullableString(indexRecord.repo_full_name),
      repoUrl: toNullableString(indexRecord.repo_url),
      finalizedAt: toNullableString(indexRecord.finalized_at),
      projectUrl:
        toTrimmedString(indexRecord.supabase_project_url) || connectionProjectUrl,
      publishableKey:
        toTrimmedString(indexRecord.supabase_publishable_key) ||
        connectionPublishableKey,
    } satisfies FederationIndexState
    : null;

  const memberships = Array.isArray(record.memberships)
    ? record.memberships.map((entry) => {
      const membershipRecord = asRecord(entry) ?? {};
      return {
        siteId: toTrimmedString(membershipRecord.site_id),
        canonicalUrl: toTrimmedString(membershipRecord.canonical_url),
        title: toTrimmedString(membershipRecord.title) || "Untitled site",
        description: toTrimmedString(membershipRecord.description),
        imageUrl: toTrimmedString(membershipRecord.image_url),
        updatedAt: toNullableString(membershipRecord.updated_at),
        trackedAt: toNullableString(membershipRecord.tracked_at),
      } satisfies FederationMembershipState;
    }).filter((membership) => membership.siteId && membership.canonicalUrl)
    : [];

  return {
    index:
      normalizedIndex && normalizedIndex.id &&
        normalizedIndex.projectUrl &&
        normalizedIndex.publishableKey
        ? normalizedIndex
        : null,
    memberships,
    connection: connectionProjectUrl && connectionPublishableKey
      ? {
        projectUrl: connectionProjectUrl,
        publishableKey: connectionPublishableKey,
      }
      : null,
  };
};

export const fetchIndexFederationState = async ({
  projectUrl,
  publishableKey,
}: {
  projectUrl: string;
  publishableKey: string;
}): Promise<FederationState> => {
  const normalizedProjectUrl = toTrimmedString(projectUrl);
  const normalizedPublishableKey = toTrimmedString(publishableKey);
  if (!normalizedProjectUrl || !normalizedPublishableKey) {
    throw new Error("Missing remote project URL or publishable key.");
  }

  const response = await fetch(
    buildRpcUrl(normalizedProjectUrl, "/rest/v1/rpc/rpc_index_federation_state"),
    {
      method: "POST",
      headers: {
        apikey: normalizedPublishableKey,
        Authorization: `Bearer ${normalizedPublishableKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
    },
  );

  if (!response.ok) {
    throw new Error(
      await describeHttpFailure(
        response,
        "Failed to read remote index federation state.",
      ),
    );
  }

  const payload = await response.json().catch(() => null);
  return normalizeFederationState({
    payload,
    fallbackProjectUrl: normalizedProjectUrl,
    fallbackPublishableKey: normalizedPublishableKey,
  });
};

export const refreshIndexFederationMirror = async ({
  supabase,
  sourceProjectUrl,
  sourcePublishableKey,
  expectedArchiveId,
}: {
  supabase: LocalSupabaseClient;
  sourceProjectUrl: string;
  sourcePublishableKey: string;
  expectedArchiveId?: string;
}): Promise<FederationRefreshResult> => {
  const federationState = await fetchIndexFederationState({
    projectUrl: sourceProjectUrl,
    publishableKey: sourcePublishableKey,
  });
  const remoteIndex = federationState.index;

  if (!remoteIndex) {
    return {
      archiveId: null,
      membershipCount: 0,
      skipped: true,
      reason: "missing_remote_index",
    };
  }

  const normalizedExpectedArchiveId = toTrimmedString(expectedArchiveId);
  if (
    normalizedExpectedArchiveId &&
    remoteIndex.id !== normalizedExpectedArchiveId
  ) {
    throw new Error("Remote federation state returned an unexpected archive id.");
  }

  const { data: existingArchive, error: existingArchiveError } = await supabase
    .from("archives")
    .select("id, owner_user_id, is_root")
    .eq("id", remoteIndex.id)
    .maybeSingle();
  if (existingArchiveError) {
    throw new Error(existingArchiveError.message);
  }

  if (existingArchive?.is_root === true) {
    return {
      archiveId: remoteIndex.id,
      membershipCount: federationState.memberships.length,
      skipped: true,
      reason: "local_root",
    };
  }

  const archivePayload = {
    slug: remoteIndex.slug || `index-${remoteIndex.id.slice(0, 8)}`,
    title: remoteIndex.title,
    description: remoteIndex.description || null,
    image_url: remoteIndex.imageUrl || null,
    canonical_url: remoteIndex.canonicalUrl,
    repo_full_name: remoteIndex.repoFullName,
    repo_url: remoteIndex.repoUrl,
    supabase_project_url: remoteIndex.projectUrl,
    supabase_publishable_key: remoteIndex.publishableKey,
    source: "federation_mirror",
    type: "index",
    is_root: false,
    runtime_mode: remoteIndex.runtimeMode,
    index_level: remoteIndex.indexLevel,
    parent_index_id: remoteIndex.parentIndexId,
    parent_index_url: remoteIndex.parentIndexUrl,
    parent_index_level: remoteIndex.parentIndexLevel,
    parent_repo_full_name: remoteIndex.parentRepoFullName,
    parent_repo_url: remoteIndex.parentRepoUrl,
    finalized_at: remoteIndex.finalizedAt,
  };

  if (existingArchive?.id) {
    const { error: archiveUpdateError } = await supabase
      .from("archives")
      .update(archivePayload)
      .eq("id", remoteIndex.id);
    if (archiveUpdateError) {
      throw new Error(archiveUpdateError.message);
    }
  } else {
    const { error: archiveInsertError } = await supabase
      .from("archives")
      .insert({
        id: remoteIndex.id,
        ...archivePayload,
        owner_user_id: existingArchive?.owner_user_id ?? null,
      });
    if (archiveInsertError) {
      throw new Error(archiveInsertError.message);
    }
  }

  const sitePayloads = federationState.memberships.map((membership) => ({
    id: membership.siteId,
    canonical_url: membership.canonicalUrl,
    title: membership.title,
    description: membership.description || null,
    image_url: membership.imageUrl || null,
  }));

  if (sitePayloads.length) {
    const { error: sitesUpsertError } = await supabase
      .from("sites")
      .upsert(sitePayloads, { onConflict: "id" });
    if (sitesUpsertError) {
      throw new Error(sitesUpsertError.message);
    }
  }

  const { error: archiveSitesDeleteError } = await supabase
    .from("archive_sites")
    .delete()
    .eq("archive_id", remoteIndex.id);
  if (archiveSitesDeleteError) {
    throw new Error(archiveSitesDeleteError.message);
  }

  if (federationState.memberships.length) {
    const { error: archiveSitesInsertError } = await supabase
      .from("archive_sites")
      .insert(
        federationState.memberships.map((membership) => ({
          archive_id: remoteIndex.id,
          site_id: membership.siteId,
          status: "tracked",
          created_at: membership.trackedAt ?? undefined,
        })),
      );
    if (archiveSitesInsertError) {
      throw new Error(archiveSitesInsertError.message);
    }
  }

  return {
    archiveId: remoteIndex.id,
    membershipCount: federationState.memberships.length,
    skipped: false,
    reason: null,
  };
};

export const notifyIndexFederationRefresh = async ({
  targetProjectUrl,
  targetPublishableKey,
  sourceArchiveId,
  sourceProjectUrl,
  sourcePublishableKey,
}: {
  targetProjectUrl: string;
  targetPublishableKey: string;
  sourceArchiveId: string;
  sourceProjectUrl: string;
  sourcePublishableKey: string;
}) => {
  const normalizedTargetProjectUrl = toTrimmedString(targetProjectUrl);
  const normalizedTargetPublishableKey = toTrimmedString(targetPublishableKey);
  const normalizedSourceArchiveId = toTrimmedString(sourceArchiveId);
  const normalizedSourceProjectUrl = toTrimmedString(sourceProjectUrl);
  const normalizedSourcePublishableKey = toTrimmedString(sourcePublishableKey);

  if (
    !normalizedTargetProjectUrl ||
    !normalizedTargetPublishableKey ||
    !normalizedSourceArchiveId ||
    !normalizedSourceProjectUrl ||
    !normalizedSourcePublishableKey
  ) {
    throw new Error("Missing federation refresh target or source connection data.");
  }

  const response = await fetch(
    buildRpcUrl(
      normalizedTargetProjectUrl,
      "/functions/v1/index-federation-refresh",
    ),
    {
      method: "POST",
      headers: {
        apikey: normalizedTargetPublishableKey,
        Authorization: `Bearer ${normalizedTargetPublishableKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        source_archive_id: normalizedSourceArchiveId,
        source_project_url: normalizedSourceProjectUrl,
        source_publishable_key: normalizedSourcePublishableKey,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await describeHttpFailure(
        response,
        "Failed to notify related index federation refresh.",
      ),
    );
  }

  return response.json().catch(() => null);
};
