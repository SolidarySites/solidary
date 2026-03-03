import { supabase } from "../../../../../../lib/supabase";
import { githubRequest } from "../../../../../../services/github";
import { toBase64 } from "../../../../../../lib/base64";
import { buildFiles } from "../build-files";
import { FILE_KEYS } from "../constants";
import { replaceDraftImageUrlsWithSitePaths } from "../draft-utils";
import {
  buildEditorFileChanges,
  createCollaborationPullRequest,
  loadEditorTouchedState
} from "./editor-helpers";
import {
  getPublishImageInfo,
  loadDraftImagesForDraft,
  uploadDraftImagesToGitHub
} from "./shared";
import type { BatchCommitResponse, PublishEditorDraftParams } from "./types";

export const publishEditorDraft = async ({
  providerToken,
  draftState,
  siteUrl,
  siteImage,
  siteImagePreview,
  draftImageUrl,
  computedSlug,
  pages,
  draftImages,
  siteSettingsInput,
  styles,
  templateSolidary,
  defaultHomeContent,
  setProvisionStep,
  sessionAccessToken,
  sessionDisplayName,
  setDraftImageUrl,
  setDraftState,
  clearTouchedPageTracking,
  setLastSavedDraftSignature,
  setPublishFeedback,
  setNotice,
  setNoticeKind,
  buildDraftSignatureForState
}: PublishEditorDraftParams): Promise<void> => {
  if (draftState.draftType !== "editor") {
    throw new Error("Editor draft is required for pull request publish.");
  }

  const [ownerLogin, repoName] = draftState.repoFullName.split("/");
  if (!ownerLogin || !repoName) {
    throw new Error("Invalid repository name.");
  }

  const { data: ownerDraft, error: ownerDraftError } = await supabase
    .from("site_drafts")
    .select("id, branch")
    .eq("site_id", draftState.siteId)
    .eq("draft_type", "owner")
    .limit(1)
    .maybeSingle();
  if (ownerDraftError) {
    throw new Error(ownerDraftError.message);
  }
  if (!ownerDraft) {
    throw new Error("Owner draft not found for this site.");
  }

  const headBranch = (draftState.editorBranch ?? draftState.branch).trim();
  const baseBranch = ownerDraft.branch.trim();
  if (!headBranch || !baseBranch) {
    throw new Error("Draft is missing branch settings.");
  }

  setProvisionStep("Ensuring collaboration branch...");
  await githubRequest("github-ensure-branch", {
    owner: ownerLogin,
    repo: repoName,
    branch: headBranch,
    baseBranch
  });

  const { touchedSections, touchedPageSlugs, deletedPageSlugs } = await loadEditorTouchedState(
    draftState.id
  );

  if (!touchedSections.size && !touchedPageSlugs.size && !deletedPageSlugs.size) {
    throw new Error("No saved editor changes to submit. Save a section first.");
  }

  const { imagePath, imageUrl } = getPublishImageInfo({
    siteImage,
    computedSlug,
    draftImageUrl,
    siteImagePreview,
    siteUrl
  });
  const normalizedPages = pages.map((page) => ({
    ...page,
    body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages)
  }));
  const files = buildFiles({
    siteId: draftState.siteId,
    imageUrl,
    settingsInput: siteSettingsInput,
    styles,
    templateSolidary,
    pages: normalizedPages,
    defaultHomeContent,
    urlOverride: siteUrl,
    previousSolidaryRaw: draftState.files[FILE_KEYS.solidary] ?? ""
  });

  const { upsertsByPath, deletePaths } = buildEditorFileChanges({
    touchedSections,
    touchedPageSlugs,
    deletedPageSlugs,
    normalizedPages,
    files
  });

  if (!upsertsByPath.size && !deletePaths.length) {
    throw new Error("No touched files were detected for this pull request.");
  }

  if (siteImage && touchedSections.has("metadata")) {
    setProvisionStep("Uploading site image...");
    const imageBase64 = toBase64(await siteImage.arrayBuffer());
    await githubRequest("github-contents-write", {
      owner: ownerLogin,
      repo: repoName,
      path: imagePath,
      message: "Update site image",
      content: imageBase64,
      branch: headBranch
    });
    setDraftImageUrl(imageUrl);
  }

  if (touchedSections.has("pages")) {
    setProvisionStep("Uploading touched draft images...");
    const draftImagesForPublish = await loadDraftImagesForDraft(draftState.id);
    if (draftImagesForPublish.length) {
      await uploadDraftImagesToGitHub({
        providerToken,
        ownerLogin,
        repoName,
        branch: headBranch,
        images: draftImagesForPublish
      });
    }
  }

  setProvisionStep("Committing editor changes...");
  await githubRequest<BatchCommitResponse>("github-contents-batch-commit", {
    owner: ownerLogin,
    repo: repoName,
    branch: headBranch,
    message: "Apply collaboration draft updates",
    upserts: Array.from(upsertsByPath.entries()).map(([path, content]) => ({
      path,
      mode: "100644",
      content: toBase64(new TextEncoder().encode(content).buffer)
    })),
    deletes: deletePaths
  });

  setProvisionStep("Creating pull request...");
  const { prNumber, prUrl, prState } = await createCollaborationPullRequest({
    draftId: draftState.id,
    sessionAccessToken,
    sessionDisplayName,
    touchedSections
  });

  const { error: clearTouchedError } = await supabase.rpc("site_editor_clear_touched", {
    p_draft_id: draftState.id
  });
  if (clearTouchedError) {
    throw new Error(clearTouchedError.message);
  }
  clearTouchedPageTracking();
  setDraftState((current) =>
    current
      ? {
          ...current,
          touchedSections: [],
          touchedPageSlugs: [],
          deletedPageSlugs: [],
          lastPullRequestNumber: prNumber,
          lastPullRequestUrl: prUrl,
          lastPullRequestState: prState
        }
      : current
  );
  setLastSavedDraftSignature(buildDraftSignatureForState({ pagesSnapshot: normalizedPages, imageUrl }));
  setPublishFeedback({
    kind: "success",
    text: `PR #${prNumber} is ready for review.`,
    runUrl: prUrl
  });
  setNotice("Pull request submitted for owner/admin review.");
  setNoticeKind("notice");
};
