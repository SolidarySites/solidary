import type { RepoFileSet } from "../../../../../features/site-draft/types";
import { buildSolidaryMarkdown } from "../../../../../features/site-draft/services/astro-builders";
import { supabase } from "../../../../../lib/supabase";
import { toBase64 } from "../../../../../lib/base64";
import { githubRequest } from "../../../../../services/github";
import { DEPLOY_WORKFLOW_TEMPLATE, RUNTIME_TEMPLATE_FILES } from "../../../../../../templates/site";
import { buildSettingsPayload, buildWellKnownFiles } from "./build-files";
import { FILE_KEYS } from "./constants";
import type { DraftSaveSettingsInput } from "./draft-utils";
import { DraftConflictError, type DraftRevisionRow } from "./save-draft-state";
import { syncConnectedSiteUrls } from "./publish/shared";
import type { DraftState } from "./types";

const resolveRepoCoordinates = (repoFullName: string) => {
  const [owner, repo] = repoFullName.trim().split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository name. Please reload and try again.");
  }
  return { owner, repo };
};

export type LiveDomainPublishResult = {
  draftFiles: RepoFileSet;
  solidaryRaw: string;
  solidaryLinksRaw: string;
  draftRevisionRow: DraftRevisionRow;
};

export const publishLiveDomainChange = async ({
  draftState,
  draftFiles,
  templateSolidary,
  templateSolidaryLinks,
  siteSettingsInput,
  nextSiteUrl,
  imageUrl,
  sessionUserId,
  commitMessage,
  workflowMode = "keep"
}: {
  draftState: DraftState;
  draftFiles: RepoFileSet;
  templateSolidary: string;
  templateSolidaryLinks: string;
  siteSettingsInput: DraftSaveSettingsInput;
  nextSiteUrl: string;
  imageUrl: string;
  sessionUserId: string | null;
  commitMessage: string;
  workflowMode?: "keep" | "remove" | "restore";
}): Promise<LiveDomainPublishResult> => {
  const nextSettingsInput = {
    ...siteSettingsInput,
    siteUrl: nextSiteUrl
  };
  const previousSolidaryRaw =
    typeof draftFiles[FILE_KEYS.solidary] === "string" ? draftFiles[FILE_KEYS.solidary] : "";
  const previousSolidaryLinksRaw =
    typeof draftFiles[FILE_KEYS.solidaryLinks] === "string" ? draftFiles[FILE_KEYS.solidaryLinks] : "";
  const { solidaryFile, solidaryLinksFile } = buildWellKnownFiles({
    templateSolidary,
    templateSolidaryLinks,
    siteId: draftState.siteId,
    settingsInput: nextSettingsInput,
    urlOverride: nextSiteUrl,
    previousSolidaryRaw,
    previousSolidaryLinksRaw
  });
  const settingsPayload = buildSettingsPayload(nextSettingsInput, imageUrl, nextSiteUrl);
  const solidaryContent = buildSolidaryMarkdown(settingsPayload);
  const nextDraftFiles: RepoFileSet = {
    ...draftFiles,
    [FILE_KEYS.astroConfig]:
      RUNTIME_TEMPLATE_FILES[FILE_KEYS.astroConfig] ?? draftFiles[FILE_KEYS.astroConfig] ?? "",
    [FILE_KEYS.robots]:
      RUNTIME_TEMPLATE_FILES[FILE_KEYS.robots] ?? draftFiles[FILE_KEYS.robots] ?? "",
    [FILE_KEYS.solidaryContent]: solidaryContent,
    [FILE_KEYS.solidary]: solidaryFile,
    [FILE_KEYS.solidaryLinks]: solidaryLinksFile
  };
  if (workflowMode === "restore") {
    nextDraftFiles[FILE_KEYS.deployWorkflow] = DEPLOY_WORKFLOW_TEMPLATE;
  }
  if (workflowMode === "remove") {
    delete nextDraftFiles[FILE_KEYS.deployWorkflow];
  }
  const { owner, repo } = resolveRepoCoordinates(draftState.repoFullName);

  const { data: draftRow, error: draftUpdateError } = await supabase
    .from("site_drafts")
    .update({
      branch: draftState.branch,
      commit_sha: "",
      files: nextDraftFiles,
      last_edited_by_user_id: sessionUserId
    })
    .eq("id", draftState.id)
    .eq("revision", draftState.revision)
    .select("revision, last_edited_at, last_edited_by_user_id")
    .maybeSingle();

  if (draftUpdateError) {
    throw new Error(draftUpdateError.message);
  }
  if (!draftRow) {
    throw new DraftConflictError();
  }

  const { error: settingsError } = await supabase.rpc("site_draft_upsert_settings_metadata", {
    p_draft_id: draftState.id,
    p_title: settingsPayload.title,
    p_description: settingsPayload.description,
    p_site_url: nextSiteUrl
  });

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  await githubRequest("github-contents-batch-commit", {
    owner,
    repo,
    branch: draftState.branch,
    message: commitMessage,
    upserts: [
      {
        path: FILE_KEYS.solidary,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(solidaryFile).buffer)
      },
      {
        path: FILE_KEYS.solidaryLinks,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(solidaryLinksFile).buffer)
      },
      {
        path: FILE_KEYS.solidaryContent,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(solidaryContent).buffer)
      },
      {
        path: FILE_KEYS.astroConfig,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(nextDraftFiles[FILE_KEYS.astroConfig] ?? "").buffer)
      },
      {
        path: FILE_KEYS.robots,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(nextDraftFiles[FILE_KEYS.robots] ?? "").buffer)
      },
      ...(workflowMode === "restore"
        ? [
            {
              path: FILE_KEYS.deployWorkflow,
              mode: "100644" as const,
              content: toBase64(new TextEncoder().encode(DEPLOY_WORKFLOW_TEMPLATE).buffer)
            }
          ]
        : [])
    ],
    deletes: workflowMode === "remove" ? [FILE_KEYS.deployWorkflow] : []
  });

  const { error: siteError } = await supabase.from("sites").upsert({
    id: draftState.siteId,
    canonical_url: nextSiteUrl.trim(),
    title: settingsPayload.title,
    description: settingsPayload.description,
    image_url: imageUrl,
    meta: {
      completion: "complete",
      source: "studio"
    }
  });

  if (siteError) {
    throw new Error(siteError.message);
  }

  await syncConnectedSiteUrls(draftState.siteId);

  return {
    draftFiles: nextDraftFiles,
    solidaryRaw: solidaryFile,
    solidaryLinksRaw: solidaryLinksFile,
    draftRevisionRow: draftRow
  };
};
