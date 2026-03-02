import { supabase } from "../../../../../../lib/supabase";
import { githubRequest, listDirectory } from "../../../../../../services/github";
import { toBase64 } from "../../../../../../lib/base64";
import { buildFiles, buildSolidaryFile } from "../build-files";
import { FILE_KEYS, PAGE_PATH_PREFIX, PAGE_PATH_SUFFIX } from "../constants";
import { buildDraftSaveSignature, replaceDraftImageUrlsWithSitePaths } from "../draft-utils";
import { getPageSafeSlug } from "../utils";
import {
  getPublishImageInfo,
  loadDraftImagesForDraft,
  uploadDraftImagesToGitHub
} from "./shared";
import type { BatchCommitResponse, PublishOwnerDraftParams } from "./types";

export const publishOwnerDraft = async ({
  providerToken,
  publishStartedAt,
  draftState,
  siteTitle,
  siteDescription,
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
  saveDraftState,
  updateDraftSolidaryFile,
  setPages,
  setDraftImages,
  setLastSavedDraftSignature,
  setDraftImageUrl,
  startPublishStatusTracking
}: PublishOwnerDraftParams): Promise<void> => {
  if (draftState.draftType !== "owner") {
    throw new Error("Owner draft is required for direct publish.");
  }

  const normalizedTitle = siteTitle.trim();
  const [ownerLogin, repoName] = draftState.repoFullName.split("/");
  if (!ownerLogin || !repoName) {
    throw new Error("Invalid repository name.");
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
  const solidaryFile = buildSolidaryFile({
    templateSolidary,
    siteId: draftState.siteId,
    imageUrl,
    settingsInput: siteSettingsInput,
    urlOverride: siteUrl,
    previousSolidaryRaw: draftState.files[FILE_KEYS.solidary] ?? ""
  });
  const draftSignatureAfterSave = buildDraftSaveSignature({
    draftId: draftState.id,
    settingsInput: siteSettingsInput,
    imageUrl,
    styles,
    pagesSnapshot: normalizedPages,
    draftImages
  });

  setProvisionStep("Saving draft...");
  await saveDraftState(draftState, solidaryFile, imageUrl, normalizedPages);
  updateDraftSolidaryFile(solidaryFile);
  setPages(normalizedPages);
  setLastSavedDraftSignature(draftSignatureAfterSave);

  if (siteImage) {
    setProvisionStep("Uploading site image...");
    const imageBase64 = toBase64(await siteImage.arrayBuffer());
    await githubRequest("/.netlify/functions/github-contents-write", {
      owner: ownerLogin,
      repo: repoName,
      path: imagePath,
      message: "Update site image",
      content: imageBase64,
      branch: draftState.branch
    });
  }

  setProvisionStep("Loading draft images...");
  const draftImagesForPublish = await loadDraftImagesForDraft(draftState.id);
  setDraftImages(draftImagesForPublish);
  const publishPages = normalizedPages.map((page) => ({
    ...page,
    body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImagesForPublish)
  }));
  setPages(publishPages);
  if (draftImagesForPublish.length) {
    setProvisionStep("Uploading draft images...");
    await uploadDraftImagesToGitHub({
      providerToken,
      ownerLogin,
      repoName,
      branch: draftState.branch,
      images: draftImagesForPublish
    });
  }

  const files = buildFiles({
    siteId: draftState.siteId,
    imageUrl,
    settingsInput: siteSettingsInput,
    styles,
    templateSolidary,
    pages: publishPages,
    defaultHomeContent,
    urlOverride: siteUrl,
    previousSolidaryRaw: draftState.files[FILE_KEYS.solidary] ?? ""
  });

  setProvisionStep("Preparing content changes...");
  const repoEntries = await listDirectory(
    providerToken,
    ownerLogin,
    repoName,
    PAGE_PATH_PREFIX.replace(/\/$/, ""),
    draftState.branch
  ).catch(() => []);
  const desiredPagePaths = new Set(
    publishPages.map((page, index) => {
      const safeSlug = getPageSafeSlug(page, index);
      return `${PAGE_PATH_PREFIX}${safeSlug}${PAGE_PATH_SUFFIX}`;
    })
  );
  const deletePaths: string[] = [];
  for (const entry of repoEntries) {
    if (entry.type !== "file" || !entry.path?.endsWith(PAGE_PATH_SUFFIX)) continue;
    if (!desiredPagePaths.has(entry.path)) {
      deletePaths.push(entry.path);
    }
  }

  setProvisionStep("Publishing content files...");
  await githubRequest<BatchCommitResponse>("/.netlify/functions/github-contents-batch-commit", {
    owner: ownerLogin,
    repo: repoName,
    branch: draftState.branch,
    message: "Publish site content",
    upserts: Object.entries(files).map(([path, content]) => ({
      path,
      mode: "100644",
      content: toBase64(new TextEncoder().encode(content).buffer)
    })),
    deletes: deletePaths
  });

  setProvisionStep("Updating site metadata...");
  const { error: siteError } = await supabase.from("sites").upsert({
    id: draftState.siteId,
    canonical_url: siteUrl.trim(),
    title: normalizedTitle,
    description: siteDescription.trim(),
    image_url: imageUrl,
    meta: {
      completion: "complete",
      source: "studio"
    }
  });
  if (siteError) {
    throw new Error(siteError.message);
  }

  setDraftImageUrl(imageUrl);
  setProvisionStep("Starting deployment status checks...");
  const branchResult = await githubRequest<{ sha?: string }>("/.netlify/functions/github-branch", {
    owner: ownerLogin,
    repo: repoName,
    branch: draftState.branch
  });
  const publishHeadSha = branchResult.sha?.trim() ?? "";
  if (!publishHeadSha) {
    throw new Error("Failed to resolve branch head after publish.");
  }
  startPublishStatusTracking({
    owner: ownerLogin,
    repo: repoName,
    branch: draftState.branch,
    headSha: publishHeadSha,
    publishStartedAt
  });
};
