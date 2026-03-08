import { useCallback, useMemo, useState } from "react";
import { requireFreshGithubAuth } from "../../../../../../features/auth/services/github-auth";
import { toBase64 } from "../../../../../../lib/base64";
import { sanitizeFilename } from "../../../../../../services/filename-sanitizer";
import { githubRequest } from "../../../../../../services/github";
import type { NoticeKind } from "../../../../../../types/notice";
import {
  REPO_SOLIDARY_MEDIA_BASE_PATH,
  isProtectedImageObject,
  type RepoImageObject
} from "../../services/media-repo";
import type { DraftState } from "../../services/types";
import {
  getFilenameExtension,
  getImageUploadExtension,
  resolveRepoContextFromDraftState
} from "./shared";

const MEDIA_IMAGE_UPLOAD_FOLDER = "images/uploads";

type UseMediaImageActionsOptions = {
  draftState: DraftState | null;
  refreshMediaAssets: () => Promise<void>;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

export const useMediaImageActions = ({
  draftState,
  refreshMediaAssets,
  setNotice,
  setNoticeKind
}: UseMediaImageActionsOptions) => {
  const [selectedMediaImageFiles, setSelectedMediaImageFiles] = useState<File[]>([]);
  const [mediaUploadingImages, setMediaUploadingImages] = useState(false);
  const [mediaRemovingImageKey, setMediaRemovingImageKey] = useState<string | null>(null);
  const [mediaRenamingImageKey, setMediaRenamingImageKey] = useState<string | null>(null);

  const handleUploadMediaImages = useCallback(async () => {
    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) {
      setNotice("Draft repository settings are missing.");
      setNoticeKind("error");
      return;
    }

    if (!selectedMediaImageFiles.length) {
      setNotice("Choose one or more images to upload.");
      setNoticeKind("error");
      return;
    }

    setMediaUploadingImages(true);
    setNotice(null);
    setNoticeKind(null);

    try {
      await requireFreshGithubAuth();

      for (const file of selectedMediaImageFiles) {
        const extension = getImageUploadExtension(file);
        const safeBaseName = sanitizeFilename(file.name, {
          stripExtension: true,
          fallback: "image",
          lowercase: true,
          spaces: "hyphen"
        });
        const fileName = `${safeBaseName}.${extension}`;
        const repoPath = `${REPO_SOLIDARY_MEDIA_BASE_PATH}/${MEDIA_IMAGE_UPLOAD_FOLDER}/${fileName}`;
        await githubRequest("github-contents-write", {
          owner: repoContext.owner,
          repo: repoContext.repo,
          path: repoPath,
          message: `Upload image ${fileName}`,
          content: toBase64(await file.arrayBuffer()),
          branch: repoContext.branch
        });
      }

      setSelectedMediaImageFiles([]);
      setNotice(
        selectedMediaImageFiles.length === 1
          ? "Uploaded 1 image."
          : `Uploaded ${selectedMediaImageFiles.length} images.`
      );
      setNoticeKind("notice");
      void refreshMediaAssets();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to upload image files.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setMediaUploadingImages(false);
    }
  }, [draftState, refreshMediaAssets, selectedMediaImageFiles, setNotice, setNoticeKind]);

  const handleRemoveMediaImageObject = useCallback(async (imageObject: RepoImageObject) => {
    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) {
      setNotice("Draft repository settings are missing.");
      setNoticeKind("error");
      return;
    }

    if (isProtectedImageObject(imageObject)) {
      setNotice("This image is protected and cannot be deleted.");
      setNoticeKind("error");
      return;
    }

    if (!imageObject.deletePaths.length) {
      setNotice("No files found for this image object.");
      setNoticeKind("error");
      return;
    }

    setMediaRemovingImageKey(imageObject.key);
    setNotice(null);
    setNoticeKind(null);

    try {
      await requireFreshGithubAuth();

      for (const path of imageObject.deletePaths) {
        await githubRequest("github-contents-delete", {
          owner: repoContext.owner,
          repo: repoContext.repo,
          path,
          message: `Delete image asset ${path.split("/").pop() ?? "image"}`,
          branch: repoContext.branch
        });
      }

      setNotice(`Deleted "${imageObject.title}".`);
      setNoticeKind("notice");
      void refreshMediaAssets();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to delete image files.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setMediaRemovingImageKey(null);
    }
  }, [draftState, refreshMediaAssets, setNotice, setNoticeKind]);

  const handleRenameMediaImageObject = useCallback(async (
    imageObject: RepoImageObject,
    nextTitle: string
  ) => {
    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) {
      setNotice("Draft repository settings are missing.");
      setNoticeKind("error");
      return;
    }

    if (isProtectedImageObject(imageObject)) {
      setNotice("This image is protected and cannot be renamed.");
      setNoticeKind("error");
      return;
    }

    const safeTitle = sanitizeFilename(nextTitle, {
      fallback: "image",
      lowercase: true,
      spaces: "hyphen"
    });
    if (!safeTitle.trim()) {
      setNotice("Enter a valid filename.");
      setNoticeKind("error");
      return;
    }

    const folderPrefix = imageObject.folderPath
      ? `${REPO_SOLIDARY_MEDIA_BASE_PATH}/${imageObject.folderPath}`
      : REPO_SOLIDARY_MEDIA_BASE_PATH;
    const renameTargets = new Map<string, string>();
    const usedTargetPaths = new Set<string>();

    imageObject.variants.forEach((variant, index) => {
      const extension = getFilenameExtension(variant.fileName) || "jpg";
      const variantSuffix =
        imageObject.uuid && variant.variant !== "custom"
          ? `${safeTitle}_${imageObject.uuid}_${variant.variant}`
          : imageObject.variants.length > 1
            ? `${safeTitle}-${index + 1}`
            : safeTitle;
      let nextPath = `${folderPrefix}/${variantSuffix}.${extension}`;
      let dedupeIndex = 1;
      while (usedTargetPaths.has(nextPath)) {
        nextPath = `${folderPrefix}/${variantSuffix}-${dedupeIndex}.${extension}`;
        dedupeIndex += 1;
      }
      usedTargetPaths.add(nextPath);
      renameTargets.set(variant.path, nextPath);
    });

    const changedEntries = Array.from(renameTargets.entries()).filter(([fromPath, toPath]) => fromPath !== toPath);
    if (!changedEntries.length) {
      setNotice("Filename already matches.");
      setNoticeKind("notice");
      return;
    }

    setMediaRenamingImageKey(imageObject.key);
    setNotice(null);
    setNoticeKind(null);

    try {
      await requireFreshGithubAuth();

      for (const [fromPath, toPath] of changedEntries) {
        const readResult = await githubRequest<{ content?: string; encoding?: string }>(
          "github-contents-read",
          {
            owner: repoContext.owner,
            repo: repoContext.repo,
            path: fromPath,
            branch: repoContext.branch
          }
        );

        const rawContent = typeof readResult.content === "string" ? readResult.content : "";
        const contentBase64 =
          readResult.encoding === "base64"
            ? rawContent.replace(/\n/g, "")
            : toBase64(new TextEncoder().encode(rawContent).buffer);

        await githubRequest("github-contents-write", {
          owner: repoContext.owner,
          repo: repoContext.repo,
          path: toPath,
          message: `Rename image ${fromPath.split("/").pop() ?? "image"}`,
          content: contentBase64,
          branch: repoContext.branch
        });

        await githubRequest("github-contents-delete", {
          owner: repoContext.owner,
          repo: repoContext.repo,
          path: fromPath,
          message: `Remove renamed source ${fromPath.split("/").pop() ?? "image"}`,
          branch: repoContext.branch
        });
      }

      setNotice(`Renamed "${imageObject.title}".`);
      setNoticeKind("notice");
      void refreshMediaAssets();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to rename image.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setMediaRenamingImageKey(null);
    }
  }, [draftState, refreshMediaAssets, setNotice, setNoticeKind]);

  const selectedMediaImageFileNames = useMemo(
    () => selectedMediaImageFiles.map((file) => file.name),
    [selectedMediaImageFiles]
  );

  return {
    selectedMediaImageFileNames,
    setSelectedMediaImageFiles,
    mediaUploadingImages,
    mediaRemovingImageKey,
    mediaRenamingImageKey,
    handleUploadMediaImages,
    handleRemoveMediaImageObject,
    handleRenameMediaImageObject
  };
};
