import { supabase } from "../../../../../lib/supabase";
import { resolveSiteImageUrl } from "../../../../../lib/site-image-url";
import { supabaseFunctionUrl } from "../../../../../lib/supabase";
import { getFreshSupabaseAuthSnapshot } from "../../../../../features/auth/services/github-auth";

export type ConnectionAccessRole = "owner" | "admin" | "editor" | "contributor";
export type SearchMode = "site" | "user";
export type ConnectionTargetType = "site" | "index";
export type ExistingConnectionState =
  | "available"
  | "pending_outgoing"
  | "pending_incoming"
  | "connected";

export type ConnectionExplorerContext = {
  draftId: string;
  siteId: string;
  siteTitle: string;
  siteUrl: string;
  repoFullName: string;
  branch: string;
  accessRole: ConnectionAccessRole | null;
};

export type ConnectionTarget = {
  targetId: string;
  targetType: ConnectionTargetType;
  siteId: string | null;
  indexId: string | null;
  title: string;
  description: string;
  siteUrl: string;
  imageUrl: string;
  ownerUserId: string | null;
  ownerDisplayName: string;
  ownerEmail: string;
  ownerGithubLogin: string | null;
  existingState: ExistingConnectionState;
  existingConnectionUuid: string | null;
  existingRequestId: string | null;
};

export type SiteConnectionRequest = {
  requestId: string;
  connectionUuid: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  respondedAt: string | null;
  sourceSiteId: string;
  sourceSiteTitle: string;
  sourceSiteUrl: string;
  sourceSiteImageUrl: string;
  sourceOwnerDisplayName: string;
  targetType: ConnectionTargetType;
  targetSiteId: string | null;
  targetIndexId: string | null;
  targetTitle: string;
  targetUrl: string;
  targetImageUrl: string;
  targetOwnerDisplayName: string;
  isIncoming: boolean;
};

type SiteConnectionSearchRow = {
  target_type: string | null;
  target_site_id: string | null;
  target_index_id: string | null;
  target_title: string | null;
  target_description: string | null;
  target_url: string | null;
  target_image_url: string | null;
  target_owner_user_id: string | null;
  target_owner_display_name: string | null;
  target_owner_email: string | null;
  target_owner_github_login: string | null;
  existing_state: string | null;
  existing_connection_id?: string | null;
  existing_connection_uuid: string | null;
  existing_request_id: string | null;
};

type SiteConnectionRequestRow = {
  request_id: string | null;
  connection_id?: string | null;
  connection_uuid: string | null;
  status: string | null;
  created_at: string | null;
  responded_at: string | null;
  source_site_id: string | null;
  source_site_title: string | null;
  source_site_url: string | null;
  source_site_image_url: string | null;
  source_owner_display_name: string | null;
  target_type: string | null;
  target_site_id: string | null;
  target_index_id: string | null;
  target_title: string | null;
  target_url: string | null;
  target_image_url: string | null;
  target_owner_display_name: string | null;
  is_incoming: boolean | null;
};

type SiteConnectionMutationRow = {
  request_id: string | null;
  connection_id?: string | null;
  connection_uuid: string | null;
  status: string | null;
};

type DraftContextRow = {
  id: string;
  site_id: string | null;
  repo_full_name: string | null;
  branch: string | null;
};

const normalizeAccessRole = (value: unknown): ConnectionAccessRole | null => {
  if (value === "owner" || value === "admin" || value === "editor" || value === "contributor") {
    return value;
  }
  if (value === "viewer") {
    return "contributor";
  }
  return null;
};

const normalizeExistingState = (value: string | null | undefined): ExistingConnectionState => {
  if (value === "pending_outgoing" || value === "pending_incoming" || value === "connected") {
    return value;
  }
  return "available";
};

const normalizeRequestStatus = (
  value: string | null | undefined
): "pending" | "approved" | "rejected" | "cancelled" => {
  if (value === "approved" || value === "rejected" || value === "cancelled") {
    return value;
  }
  return "pending";
};

const mapSearchRows = (rows: SiteConnectionSearchRow[] | null | undefined): ConnectionTarget[] =>
  (rows ?? [])
    .map((row) => {
      const targetType: ConnectionTargetType =
        row.target_type === "index"
          ? "index"
          : "site";
      const siteId = typeof row.target_site_id === "string" ? row.target_site_id.trim() : "";
      const indexId =
        typeof row.target_index_id === "string" ? row.target_index_id.trim() : "";
      const targetId = targetType === "index" ? indexId : siteId;
      if (!targetId) return null;

      const ownerUserId =
        typeof row.target_owner_user_id === "string" && row.target_owner_user_id.trim()
          ? row.target_owner_user_id.trim()
          : null;

      const ownerEmail = typeof row.target_owner_email === "string" ? row.target_owner_email.trim() : "";
      const ownerDisplayName =
        typeof row.target_owner_display_name === "string" && row.target_owner_display_name.trim()
          ? row.target_owner_display_name.trim()
          : ownerEmail || "Unknown";

      return {
        targetId,
        targetType,
        siteId: siteId || null,
        indexId: indexId || null,
        siteUrl: typeof row.target_url === "string" ? row.target_url : "",
        title:
          typeof row.target_title === "string" && row.target_title.trim()
            ? row.target_title.trim()
            : targetType === "index"
              ? "Untitled index"
              : "Untitled site",
        description: typeof row.target_description === "string" ? row.target_description : "",
        imageUrl: resolveSiteImageUrl(
          typeof row.target_url === "string" ? row.target_url : "",
          typeof row.target_image_url === "string" ? row.target_image_url : ""
        ),
        ownerUserId,
        ownerDisplayName,
        ownerEmail,
        ownerGithubLogin:
          typeof row.target_owner_github_login === "string" && row.target_owner_github_login.trim()
            ? row.target_owner_github_login.trim()
            : null,
        existingState: normalizeExistingState(row.existing_state),
        existingConnectionUuid:
          typeof row.existing_connection_id === "string" && row.existing_connection_id.trim()
            ? row.existing_connection_id.trim()
            : typeof row.existing_connection_uuid === "string" && row.existing_connection_uuid.trim()
              ? row.existing_connection_uuid.trim()
            : null,
        existingRequestId:
          typeof row.existing_request_id === "string" && row.existing_request_id.trim()
            ? row.existing_request_id.trim()
            : null
      } satisfies ConnectionTarget;
    })
    .filter((entry): entry is ConnectionTarget => Boolean(entry));

const mapRequestRows = (rows: SiteConnectionRequestRow[] | null | undefined): SiteConnectionRequest[] =>
  (rows ?? [])
    .map((row) => {
      const requestId = typeof row.request_id === "string" ? row.request_id.trim() : "";
      const connectionUuid =
        typeof row.connection_id === "string" && row.connection_id.trim()
          ? row.connection_id.trim()
          : typeof row.connection_uuid === "string" ? row.connection_uuid.trim() : "";
      const sourceSiteId = typeof row.source_site_id === "string" ? row.source_site_id.trim() : "";
      const targetType: ConnectionTargetType =
        row.target_type === "index"
          ? "index"
          : "site";
      const targetSiteId = typeof row.target_site_id === "string" ? row.target_site_id.trim() : "";
      const targetIndexId =
        typeof row.target_index_id === "string" ? row.target_index_id.trim() : "";
      if (!requestId || !connectionUuid || !sourceSiteId) return null;
      if (targetType === "index" && !targetIndexId) return null;
      if (targetType === "site" && !targetSiteId) return null;

      return {
        requestId,
        connectionUuid,
        status: normalizeRequestStatus(row.status),
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        respondedAt: typeof row.responded_at === "string" ? row.responded_at : null,
        sourceSiteId,
        sourceSiteUrl: typeof row.source_site_url === "string" ? row.source_site_url : "",
        sourceSiteTitle:
          typeof row.source_site_title === "string" && row.source_site_title.trim()
            ? row.source_site_title.trim()
            : "Untitled site",
        sourceSiteImageUrl: resolveSiteImageUrl(
          typeof row.source_site_url === "string" ? row.source_site_url : "",
          typeof row.source_site_image_url === "string" ? row.source_site_image_url : ""
        ),
        sourceOwnerDisplayName:
          typeof row.source_owner_display_name === "string" && row.source_owner_display_name.trim()
            ? row.source_owner_display_name.trim()
            : "Unknown",
        targetType,
        targetSiteId: targetSiteId || null,
        targetIndexId: targetIndexId || null,
        targetUrl: typeof row.target_url === "string" ? row.target_url : "",
        targetTitle:
          typeof row.target_title === "string" && row.target_title.trim()
            ? row.target_title.trim()
            : targetType === "index"
              ? "Untitled index"
              : "Untitled site",
        targetImageUrl: resolveSiteImageUrl(
          typeof row.target_url === "string" ? row.target_url : "",
          typeof row.target_image_url === "string" ? row.target_image_url : ""
        ),
        targetOwnerDisplayName:
          typeof row.target_owner_display_name === "string" && row.target_owner_display_name.trim()
            ? row.target_owner_display_name.trim()
            : "Unknown",
        isIncoming: Boolean(row.is_incoming)
      } satisfies SiteConnectionRequest;
    })
    .filter((entry): entry is SiteConnectionRequest => Boolean(entry))
    .filter((entry) => entry.createdAt.length > 0);

const mapMutationRows = (rows: SiteConnectionMutationRow[] | null | undefined) => {
  const first = (rows ?? [])[0];
  if (!first) return null;
  const requestId = typeof first.request_id === "string" ? first.request_id.trim() : "";
  const connectionUuid =
    typeof first.connection_id === "string" && first.connection_id.trim()
      ? first.connection_id.trim()
      : typeof first.connection_uuid === "string" ? first.connection_uuid.trim() : "";
  const status = normalizeRequestStatus(first.status);
  if (!requestId || !connectionUuid) return null;
  return { requestId, connectionUuid, status };
};

const callAuthenticatedConnectionFunction = async <T>({
  functionName,
  body,
  fallbackError
}: {
  functionName: string;
  body: Record<string, unknown>;
  fallbackError: string;
}): Promise<T> => {
  const snapshot = await getFreshSupabaseAuthSnapshot();
  const accessToken = snapshot.supabaseAccessToken?.trim() ?? "";
  if (!accessToken) {
    throw new Error("Missing Supabase session token.");
  }

  const response = await fetch(supabaseFunctionUrl(functionName), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : fallbackError;
    throw new Error(message);
  }

  return payload as T;
};

export const resolveConnectionExplorerContext = async ({
  draftId,
  userId
}: {
  draftId: string;
  userId: string;
}): Promise<ConnectionExplorerContext> => {
  const { data: draftRowData, error: draftError } = await supabase
    .from("site_drafts")
    .select("id, site_id, repo_full_name, branch")
    .eq("id", draftId)
    .maybeSingle();

  if (draftError) {
    throw new Error(draftError.message);
  }

  if (!draftRowData) {
    throw new Error("Site draft not found or access denied.");
  }

  const draftRow = draftRowData as DraftContextRow;
  const siteId =
    typeof draftRow.site_id === "string" && draftRow.site_id.trim() ? draftRow.site_id : draftRow.id;

  const [{ data: roleData, error: roleError }, { data: siteData, error: siteError }] = await Promise.all([
    supabase.rpc("site_user_role_for_site", {
      p_site_id: siteId,
      p_user_id: userId
    }),
    supabase.from("sites").select("title, canonical_url").eq("id", siteId).maybeSingle()
  ]);

  if (roleError) {
    throw new Error(roleError.message);
  }

  if (siteError) {
    throw new Error(siteError.message);
  }

  const fallbackSiteTitle =
    typeof draftRow.repo_full_name === "string" && draftRow.repo_full_name.includes("/")
      ? draftRow.repo_full_name.split("/")[1] ?? draftRow.repo_full_name
      : (draftRow.repo_full_name ?? "Untitled site");

  return {
    draftId: draftRow.id,
    siteId,
    siteTitle:
      typeof siteData?.title === "string" && siteData.title.trim()
        ? siteData.title.trim()
        : fallbackSiteTitle,
    siteUrl: typeof siteData?.canonical_url === "string" ? siteData.canonical_url : "",
    repoFullName:
      typeof draftRow.repo_full_name === "string" ? draftRow.repo_full_name.trim() : "",
    branch: typeof draftRow.branch === "string" && draftRow.branch.trim() ? draftRow.branch : "main",
    accessRole: normalizeAccessRole(roleData)
  };
};

export const searchConnectionTargets = async ({
  sourceSiteId,
  mode,
  query,
  limit = 20
}: {
  sourceSiteId: string;
  mode: SearchMode;
  query: string;
  limit?: number;
}): Promise<ConnectionTarget[]> => {
  const snapshot = await getFreshSupabaseAuthSnapshot();
  const accessToken = snapshot.supabaseAccessToken?.trim() ?? "";
  if (!accessToken) {
    throw new Error("Missing Supabase session token.");
  }

  const response = await fetch(supabaseFunctionUrl("site-connection-search"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      source_site_id: sourceSiteId,
      query,
      mode,
      limit
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : "Could not search connection targets.";
    throw new Error(message);
  }

  const results =
    payload && typeof payload === "object" && Array.isArray(payload.results)
      ? payload.results
      : [];
  return mapSearchRows(results as SiteConnectionSearchRow[]);
};

export const listSiteConnectionRequests = async ({
  siteId
}: {
  siteId: string;
}): Promise<SiteConnectionRequest[]> => {
  const payload = await callAuthenticatedConnectionFunction<{ requests?: SiteConnectionRequestRow[] }>({
    functionName: "site-connection-requests",
    body: { site_id: siteId },
    fallbackError: "Could not load connection requests."
  });

  return mapRequestRows(payload.requests ?? []);
};

export const sendSiteConnectionInvite = async ({
  sourceSiteId,
  targetSiteId,
  targetIndexId
}: {
  sourceSiteId: string;
  targetSiteId?: string | null;
  targetIndexId?: string | null;
}) => {
  const payload = await callAuthenticatedConnectionFunction<SiteConnectionMutationRow>({
    functionName: "site-connection-write",
    body: {
      action: "send_invite",
      source_site_id: sourceSiteId,
      target_site_id: targetSiteId?.trim() || null,
      target_index_id: targetIndexId?.trim() || null
    },
    fallbackError: "Connection invite could not be created."
  });
  const row = mapMutationRows([payload]);
  if (!row) {
    throw new Error("Connection invite could not be created.");
  }
  return row;
};

export const respondToSiteConnectionRequest = async ({
  siteId,
  requestId,
  action
}: {
  siteId: string;
  requestId: string;
  action: "approve" | "reject";
}) => {
  const payload = await callAuthenticatedConnectionFunction<SiteConnectionMutationRow>({
    functionName: "site-connection-write",
    body: {
      action: "respond",
      source_site_id: siteId,
      request_id: requestId,
      response_action: action
    },
    fallbackError: "Connection request could not be updated."
  });
  const row = mapMutationRows([payload]);
  if (!row) {
    throw new Error("Connection request could not be updated.");
  }
  return row;
};

export const disconnectSiteConnection = async ({
  requestId,
  siteId
}: {
  requestId: string;
  siteId: string;
}) => {
  const payload = await callAuthenticatedConnectionFunction<SiteConnectionMutationRow>({
    functionName: "site-connection-write",
    body: {
      action: "disconnect",
      source_site_id: siteId,
      request_id: requestId
    },
    fallbackError: "Connection could not be removed."
  });
  const row = mapMutationRows([payload]);
  if (!row) {
    throw new Error("Connection could not be removed.");
  }
  return row;
};
