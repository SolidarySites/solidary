import type { Session } from "@supabase/supabase-js";
import type { AstroPageDraft } from "../../../../features/site-draft/types";
import { supabase } from "../../../../lib/supabase";
import { loadRootIndex, type RootIndexRow } from "../../../../services/root-index";
import { normalizeSiteTitle } from "../../../../services/site-metadata";
import { buildSettingsPayload, FILE_KEYS } from "./content";
import type { DbWriteStage, ProvisioningDiagnostics } from "./types";

export type { RootIndexRow };
export { loadRootIndex };

const getSessionExpiresAt = (session: Session) => {
  if (typeof session.expires_at === "number") {
    return session.expires_at;
  }
  return null;
};

const logProvisioningDbError = ({
  stage,
  error,
  diagnostics
}: {
  stage: DbWriteStage;
  error: { message: string; code?: string; details?: string | null; hint?: string | null };
  diagnostics: ProvisioningDiagnostics;
}) => {
  console.error(`[site-create] ${stage} failed`, {
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    message: error.message,
    diagnostics
  });
};

const logProvisioningAuthMismatch = ({
  capturedSessionUserId,
  liveAuthUserId,
  sessionExpiresAt,
  nowUnixSeconds,
  siteId,
  repoFullName
}: ProvisioningDiagnostics) => {
  console.error("[site-create] auth user mismatch before database writes", {
    capturedSessionUserId,
    liveAuthUserId,
    sessionExpiresAt,
    nowUnixSeconds,
    siteId,
    repoFullName
  });
};

const verifyLiveAuthUser = async ({
  session,
  siteId,
  repoFullName
}: {
  session: Session;
  siteId: string;
  repoFullName: string;
}) => {
  const capturedSessionUserId = session.user.id;
  const { data: liveAuthUserData, error: liveAuthError } = await supabase.auth.getUser();
  if (liveAuthError) {
    console.error("[site-create] failed to resolve live auth user before database writes", {
      message: liveAuthError.message,
      status: liveAuthError.status ?? null,
      siteId,
      repoFullName
    });
    throw new Error("Could not verify your auth session. Please sign in again and retry.");
  }

  const liveAuthUserId = liveAuthUserData.user?.id;
  if (!liveAuthUserId) {
    console.error("[site-create] auth session missing before database writes", {
      siteId,
      repoFullName
    });
    throw new Error("Your auth session expired. Please sign in again and retry.");
  }

  const diagnostics: ProvisioningDiagnostics = {
    capturedSessionUserId,
    liveAuthUserId,
    sessionExpiresAt: getSessionExpiresAt(session),
    nowUnixSeconds: Math.floor(Date.now() / 1000),
    siteId,
    repoFullName
  };

  if (liveAuthUserId !== capturedSessionUserId) {
    logProvisioningAuthMismatch(diagnostics);
    throw new Error("Your auth session changed while creating the site. Please sign in again and retry.");
  }

  return {
    liveAuthUserId,
    diagnostics
  };
};

export const saveProvisionedSiteDraft = async ({
  session,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  siteUrlResolved,
  siteRecordImageUrl,
  imageUrl,
  repoFullName,
  defaultBranch,
  solidaryFile,
  solidaryLinksFile,
  tokensCss,
  pages,
  rootIndex,
  rootConnectionUuid
}: {
  session: Session;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  siteUrlResolved: string;
  siteRecordImageUrl: string;
  imageUrl: string;
  repoFullName: string;
  defaultBranch: string;
  solidaryFile: string;
  solidaryLinksFile: string;
  tokensCss: string;
  pages: AstroPageDraft[];
  rootIndex?: RootIndexRow;
  rootConnectionUuid?: string;
}) => {
  const normalizedTitle = normalizeSiteTitle(siteTitle);
  const normalizedDescription = siteDescription.trim();
  const { liveAuthUserId, diagnostics } = await verifyLiveAuthUser({
    session,
    siteId,
    repoFullName
  });
  const resolvedRootIndex = rootIndex ?? await loadRootIndex();

  const { error: siteError } = await supabase.from("sites").insert({
    id: siteId,
    canonical_url: siteUrlResolved,
    title: normalizedTitle,
    description: normalizedDescription,
    image_url: siteRecordImageUrl,
    parent_index_id: resolvedRootIndex.id,
    parent_index_url: resolvedRootIndex.canonical_url,
    parent_index_level: resolvedRootIndex.index_level,
    meta: {
      completion: "complete",
      source: "studio"
    }
  });
  if (siteError) {
    logProvisioningDbError({
      stage: "sites_insert",
      error: siteError,
      diagnostics
    });
    throw new Error(siteError.message);
  }

  const { error: draftError } = await supabase.from("site_drafts").insert({
    id: siteId,
    site_id: siteId,
    owner_user_id: liveAuthUserId,
    repo_full_name: repoFullName,
    branch: defaultBranch,
    commit_sha: "",
    files: {
      [FILE_KEYS.solidary]: solidaryFile,
      [FILE_KEYS.solidaryLinks]: solidaryLinksFile
    },
    draft_type: "owner",
    source_owner_draft_id: null,
    touched_sections: [],
    touched_page_slugs: [],
    deleted_page_slugs: []
  });

  if (draftError) {
    logProvisioningDbError({
      stage: "site_drafts_insert",
      error: draftError,
      diagnostics
    });
    if (draftError.code === "23505") {
      throw new Error("A draft already exists for this repository and account. Open it from Studio instead.");
    }
    throw new Error(draftError.message);
  }

  const { error: connectionError } = await supabase.rpc("connection_create_site_index", {
    p_source_site_id: siteId,
    p_target_index_id: resolvedRootIndex.id,
    p_connection_uuid: rootConnectionUuid ?? null
  });
  if (connectionError) {
    logProvisioningDbError({
      stage: "connections_insert",
      error: connectionError,
      diagnostics
    });
    throw new Error(connectionError.message);
  }

  const { error: archiveSiteError } = await supabase.from("index_sites").insert({
    index_id: resolvedRootIndex.id,
    site_id: siteId,
    status: "tracked",
    delist_reason_code: null,
    delist_note: null
  });
  if (archiveSiteError) {
    logProvisioningDbError({
      stage: "index_sites_insert",
      error: archiveSiteError,
      diagnostics
    });
    throw new Error(archiveSiteError.message);
  }

  const settings = buildSettingsPayload({
    siteTitle,
    siteDescription,
    siteUrl,
    imageUrl,
    urlOverride: siteUrlResolved
  });
  const { error: settingsError } = await supabase.from("site_draft_settings").upsert({
    draft_id: siteId,
    settings,
    styles: {
      tokensCss
    }
  });

  if (settingsError) {
    logProvisioningDbError({
      stage: "site_draft_settings_upsert",
      error: settingsError,
      diagnostics
    });
    throw new Error(settingsError.message);
  }

  const { error: pagesError } = await supabase.from("site_draft_pages").insert(
    pages.map((page, index) => ({
      draft_id: siteId,
      slug: page.slug,
      title: page.title,
      content: page.body,
      javascript: (page.javascript ?? "").trim(),
      show_in_nav: page.showInNav,
      position: index,
      is_home: page.slug === "home"
    }))
  );

  if (pagesError) {
    logProvisioningDbError({
      stage: "site_draft_pages_insert",
      error: pagesError,
      diagnostics
    });
    throw new Error(pagesError.message);
  }
};
