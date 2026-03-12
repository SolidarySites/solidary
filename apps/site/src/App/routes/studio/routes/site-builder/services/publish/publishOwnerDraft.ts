import { supabase } from "../../../../../../lib/supabase";
import { normalizeSiteImagePathForStorage } from "../../../../../../lib/site-image-url";
import { githubRequest, listDirectory } from "../../../../../../services/github";
import { toBase64 } from "../../../../../../lib/base64";
import { normalizeSiteTitle } from "../../../../../../services/site-metadata";
import { buildFiles, buildWellKnownFiles } from "../build-files";
import { FILE_KEYS, PAGE_PATH_PREFIX, PAGE_PATH_SUFFIX } from "../constants";
import { buildDraftSaveSignature, replaceDraftImageUrlsWithSitePaths } from "../draft-utils";
import { getPageSafeSlug } from "../utils";
import {
  getPublishImageInfo,
  loadDraftImagesForDraft,
  syncConnectedSiteUrls,
  uploadSiteImageAssetsToGitHub,
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
  templateSolidaryLinks,
  defaultHomeContent,
  setProvisionStep,
  saveDraftState,
  updateDraftWellKnownFiles,
  setPages,
  setDraftImages,
  setLastSavedDraftSignature,
  setDraftImageUrl,
  startPublishStatusTracking
}: PublishOwnerDraftParams): Promise<void> => {
  if (draftState.draftType !== "owner") {
    throw new Error("Owner draft is required for direct publish.");
  }

  const normalizedTitle = normalizeSiteTitle(siteTitle);
  const [ownerLogin, repoName] = draftState.repoFullName.split("/");
  if (!ownerLogin || !repoName) {
    throw new Error("Invalid repository name.");
  }

  const { imageUrl } = getPublishImageInfo({
    siteImage,
    computedSlug,
    draftImageUrl,
    siteImagePreview,
    siteUrl
  });
  const siteRecordImageUrl = normalizeSiteImagePathForStorage({
    siteUrl,
    imageUrl
  });
  const normalizedPages = pages.map((page) => ({
    ...page,
    body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages)
  }));
  const { solidaryFile, solidaryLinksFile } = buildWellKnownFiles({
    templateSolidary,
    templateSolidaryLinks,
    siteId: draftState.siteId,
    settingsInput: siteSettingsInput,
    urlOverride: siteUrl,
    hasSiteImage: siteImage ? true : undefined,
    previousSolidaryRaw: draftState.files[FILE_KEYS.solidary] ?? "",
    previousSolidaryLinksRaw: draftState.files[FILE_KEYS.solidaryLinks] ?? ""
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
  await saveDraftState(draftState, solidaryFile, solidaryLinksFile, imageUrl, normalizedPages);
  updateDraftWellKnownFiles(solidaryFile, solidaryLinksFile);
  setPages(normalizedPages);
  setLastSavedDraftSignature(draftSignatureAfterSave);

  if (siteImage) {
    setProvisionStep("Uploading site image...");
    await uploadSiteImageAssetsToGitHub({
      ownerLogin,
      repoName,
      branch: draftState.branch,
      siteImage,
      message: "Update site image assets"
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
    ogImageUrl: imageUrl,
    settingsInput: siteSettingsInput,
    styles,
    templateSolidary,
    templateSolidaryLinks,
    pages: publishPages,
    defaultHomeContent,
    urlOverride: siteUrl,
    hasSiteImage: siteImage ? true : undefined,
    previousSolidaryRaw: draftState.files[FILE_KEYS.solidary] ?? "",
    previousSolidaryLinksRaw: draftState.files[FILE_KEYS.solidaryLinks] ?? ""
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
  await githubRequest<BatchCommitResponse>("github-contents-batch-commit", {
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
    image_url: siteRecordImageUrl,
    meta: {
      completion: "complete",
      source: "studio"
    }
  });
  if (siteError) {
    throw new Error(siteError.message);
  }
  await syncConnectedSiteUrls(draftState.siteId);

  setDraftImageUrl(imageUrl);
  setProvisionStep("Starting deployment status checks...");
  const branchResult = await githubRequest<{ sha?: string }>("github-branch", {
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
