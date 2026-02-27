import { supabase } from "../../../../../lib/supabase";
import { resolveSiteImageUrl } from "../../../../../lib/site-image-url";

export type ConnectionAccessRole = "owner" | "admin" | "editor" | "contributor";
export type SearchMode = "site" | "user";
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
  accessRole: ConnectionAccessRole | null;
};

export type ConnectionTarget = {
  siteId: string;
  title: string;
  description: string;
  siteUrl: string;
  imageUrl: string;
  ownerUserId: string;
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
  targetSiteId: string;
  targetSiteTitle: string;
  targetSiteUrl: string;
  targetSiteImageUrl: string;
  targetOwnerDisplayName: string;
  isIncoming: boolean;
};

type SiteConnectionSearchRow = {
  target_site_id: string | null;
  target_site_title: string | null;
  target_site_description: string | null;
  target_site_url: string | null;
  target_site_image_url: string | null;
  target_owner_user_id: string | null;
  target_owner_display_name: string | null;
  target_owner_email: string | null;
  target_owner_github_login: string | null;
  existing_state: string | null;
  existing_connection_uuid: string | null;
  existing_request_id: string | null;
};

type SiteConnectionRequestRow = {
  request_id: string | null;
  connection_uuid: string | null;
  status: string | null;
  created_at: string | null;
  responded_at: string | null;
  source_site_id: string | null;
  source_site_title: string | null;
  source_site_url: string | null;
  source_site_image_url: string | null;
  source_owner_display_name: string | null;
  target_site_id: string | null;
  target_site_title: string | null;
  target_site_url: string | null;
  target_site_image_url: string | null;
  target_owner_display_name: string | null;
  is_incoming: boolean | null;
};

type SiteConnectionMutationRow = {
  request_id: string | null;
  connection_uuid: string | null;
  status: string | null;
};

type DraftContextRow = {
  id: string;
  site_id: string | null;
  repo_full_name: string | null;
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
      const siteId = typeof row.target_site_id === "string" ? row.target_site_id.trim() : "";
      const ownerUserId = typeof row.target_owner_user_id === "string" ? row.target_owner_user_id.trim() : "";
      if (!siteId || !ownerUserId) return null;

      const ownerEmail = typeof row.target_owner_email === "string" ? row.target_owner_email.trim() : "";
      const ownerDisplayName =
        typeof row.target_owner_display_name === "string" && row.target_owner_display_name.trim()
          ? row.target_owner_display_name.trim()
          : ownerEmail || "Unknown";

      return {
        siteUrl: typeof row.target_site_url === "string" ? row.target_site_url : "",
        siteId,
        title:
          typeof row.target_site_title === "string" && row.target_site_title.trim()
            ? row.target_site_title.trim()
            : "Untitled site",
        description: typeof row.target_site_description === "string" ? row.target_site_description : "",
        imageUrl: resolveSiteImageUrl(
          typeof row.target_site_url === "string" ? row.target_site_url : "",
          typeof row.target_site_image_url === "string" ? row.target_site_image_url : ""
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
          typeof row.existing_connection_uuid === "string" && row.existing_connection_uuid.trim()
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
      const connectionUuid = typeof row.connection_uuid === "string" ? row.connection_uuid.trim() : "";
      const sourceSiteId = typeof row.source_site_id === "string" ? row.source_site_id.trim() : "";
      const targetSiteId = typeof row.target_site_id === "string" ? row.target_site_id.trim() : "";
      if (!requestId || !connectionUuid || !sourceSiteId || !targetSiteId) return null;

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
        targetSiteId,
        targetSiteUrl: typeof row.target_site_url === "string" ? row.target_site_url : "",
        targetSiteTitle:
          typeof row.target_site_title === "string" && row.target_site_title.trim()
            ? row.target_site_title.trim()
            : "Untitled site",
        targetSiteImageUrl: resolveSiteImageUrl(
          typeof row.target_site_url === "string" ? row.target_site_url : "",
          typeof row.target_site_image_url === "string" ? row.target_site_image_url : ""
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
  const connectionUuid = typeof first.connection_uuid === "string" ? first.connection_uuid.trim() : "";
  const status = normalizeRequestStatus(first.status);
  if (!requestId || !connectionUuid) return null;
  return { requestId, connectionUuid, status };
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
    .select("id, site_id, repo_full_name")
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
  const { data, error } = await supabase.rpc("site_connection_search_targets", {
    p_source_site_id: sourceSiteId,
    p_query: query,
    p_mode: mode,
    p_limit: limit
  });

  if (error) {
    throw new Error(error.message);
  }

  return mapSearchRows((data ?? []) as SiteConnectionSearchRow[]);
};

export const listSiteConnectionRequests = async ({
  siteId
}: {
  siteId: string;
}): Promise<SiteConnectionRequest[]> => {
  const { data, error } = await supabase.rpc("site_connection_list_requests", {
    p_site_id: siteId
  });

  if (error) {
    throw new Error(error.message);
  }

  return mapRequestRows((data ?? []) as SiteConnectionRequestRow[]);
};

export const sendSiteConnectionInvite = async ({
  sourceSiteId,
  targetSiteId
}: {
  sourceSiteId: string;
  targetSiteId: string;
}) => {
  const { data, error } = await supabase.rpc("site_connection_send_invite", {
    p_source_site_id: sourceSiteId,
    p_target_site_id: targetSiteId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = mapMutationRows((data ?? []) as SiteConnectionMutationRow[]);
  if (!row) {
    throw new Error("Connection invite could not be created.");
  }
  return row;
};

export const respondToSiteConnectionRequest = async ({
  requestId,
  action
}: {
  requestId: string;
  action: "approve" | "reject";
}) => {
  const { data, error } = await supabase.rpc("site_connection_respond", {
    p_request_id: requestId,
    p_action: action
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = mapMutationRows((data ?? []) as SiteConnectionMutationRow[]);
  if (!row) {
    throw new Error("Connection request could not be updated.");
  }
  return row;
};
