import { useCallback, useMemo, useState } from "react";
import { requireFreshGithubAuth } from "../../../../../../features/auth/services/github-auth";
import { toBase64 } from "../../../../../../lib/base64";
import { sanitizeFilename } from "../../../../../../services/filename-sanitizer";
import { githubRequest } from "../../../../../../services/github";
import type { NoticeKind } from "../../../../../../types/notice";
import {
  appendFontFaceBlock,
  getSupportedFontExtension,
  inspectUploadedFont,
  removeFontFaceBlocksByPublicPath,
  REPO_FONTS_BASE_PATH,
  REPO_FONTS_CSS_PATH,
  resolveFontFaceDescriptors,
  type RepoMediaFileEntry
} from "../../services/media-repo";
import type { DraftState } from "../../services/types";
import {
  getBasePathFromSiteUrl,
  resolveRepoContextFromDraftState,
  withBasePath
} from "./shared";
import type { RepoFontsCssUpdate } from "./useRepoStyleAssets";

type UseMediaFontActionsOptions = {
  draftState: DraftState | null;
  siteUrl: string;
  repoFontsCss: string;
  applyRepoFontsCssUpdate: (update: RepoFontsCssUpdate) => void;
  refreshMediaAssets: () => Promise<void>;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

export const useMediaFontActions = ({
  draftState,
  siteUrl,
  repoFontsCss,
  applyRepoFontsCssUpdate,
  refreshMediaAssets,
  setNotice,
  setNoticeKind
}: UseMediaFontActionsOptions) => {
  const [selectedMediaFontFile, setSelectedMediaFontFile] = useState<File | null>(null);
  const [mediaFontFamilyName, setMediaFontFamilyName] = useState("");
  const [mediaUploadingFont, setMediaUploadingFont] = useState(false);
  const [mediaRemovingFontPath, setMediaRemovingFontPath] = useState<string | null>(null);

  const handleUploadMediaFont = useCallback(async () => {
    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) {
      setNotice("Draft repository settings are missing.");
      setNoticeKind("error");
      return;
    }

    if (!selectedMediaFontFile) {
      setNotice("Choose a font package to upload.");
      setNoticeKind("error");
      return;
    }

    const extension = getSupportedFontExtension(selectedMediaFontFile.name);
    if (!extension) {
      setNotice("Unsupported font type. Use OTF, TTF, WOFF, or WOFF2.");
      setNoticeKind("error");
      return;
    }

    const familyName = mediaFontFamilyName.trim();
    if (!familyName) {
      setNotice("Enter a font-family name before uploading.");
      setNoticeKind("error");
      return;
    }

    const rawName = sanitizeFilename(selectedMediaFontFile.name, {
      lowercase: true,
      spaces: "hyphen"
    });
    const safeBaseName = sanitizeFilename(rawName, {
      stripExtension: true,
      fallback: "font",
      lowercase: true,
      spaces: "hyphen"
    });
    const fileName = `${safeBaseName}.${extension}`;
    const fontRepoPath = `${REPO_FONTS_BASE_PATH}/${fileName}`;
    const basePath = getBasePathFromSiteUrl(siteUrl);
    const fontPublicPath = withBasePath(basePath, fontRepoPath.replace(/^public\//, ""));

    setMediaUploadingFont(true);
    setNotice(null);
    setNoticeKind(null);

    try {
      const inspectedFaces = await inspectUploadedFont(selectedMediaFontFile);
      const fontFaceDescriptors = resolveFontFaceDescriptors(inspectedFaces);

      await requireFreshGithubAuth();

      await githubRequest("github-contents-write", {
        owner: repoContext.owner,
        repo: repoContext.repo,
        path: fontRepoPath,
        message: `Upload font package ${fileName}`,
        content: toBase64(await selectedMediaFontFile.arrayBuffer()),
        branch: repoContext.branch
      });

      let nextFontsCss = repoFontsCss;
      fontFaceDescriptors.forEach((descriptor) => {
        nextFontsCss = appendFontFaceBlock({
          fontsCss: nextFontsCss,
          fontFamily: familyName,
          publicPath: fontPublicPath,
          extension,
          fontWeight: descriptor.fontWeight,
          fontStyle: descriptor.fontStyle
        });
      });
      const fontsCssToWrite = nextFontsCss.trim() ? nextFontsCss : "/* no custom font faces */\n";

      await githubRequest("github-contents-write", {
        owner: repoContext.owner,
        repo: repoContext.repo,
        path: REPO_FONTS_CSS_PATH,
        message: `Update fonts.css for ${familyName}`,
        content: toBase64(new TextEncoder().encode(fontsCssToWrite).buffer),
        branch: repoContext.branch
      });

      applyRepoFontsCssUpdate({
        repoFullName: repoContext.repoFullName,
        branch: repoContext.branch,
        fontsCss: fontsCssToWrite
      });
      setSelectedMediaFontFile(null);
      setMediaFontFamilyName("");

      const descriptorSummary = fontFaceDescriptors
        .map((descriptor) => `${descriptor.fontWeight} ${descriptor.fontStyle}`)
        .join(", ");
      setNotice(
        `Uploaded ${fileName} and added @font-face for "${familyName}" (${descriptorSummary}).`
      );
      setNoticeKind("notice");
      void refreshMediaAssets();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to upload font package.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setMediaUploadingFont(false);
    }
  }, [
    applyRepoFontsCssUpdate,
    draftState,
    mediaFontFamilyName,
    refreshMediaAssets,
    repoFontsCss,
    selectedMediaFontFile,
    setNotice,
    setNoticeKind,
    siteUrl
  ]);

  const handleRemoveMediaFont = useCallback(async (entry: RepoMediaFileEntry) => {
    const repoContext = resolveRepoContextFromDraftState(draftState);
    if (!repoContext) {
      setNotice("Draft repository settings are missing.");
      setNoticeKind("error");
      return;
    }

    if (!entry.path.trim()) {
      setNotice("Missing font package path.");
      setNoticeKind("error");
      return;
    }

    setMediaRemovingFontPath(entry.path);
    setNotice(null);
    setNoticeKind(null);

    try {
      await requireFreshGithubAuth();

      await githubRequest("github-contents-delete", {
        owner: repoContext.owner,
        repo: repoContext.repo,
        path: entry.path,
        message: `Remove font package ${entry.name}`,
        branch: repoContext.branch
      });

      const nextFontsCss = removeFontFaceBlocksByPublicPath({
        fontsCss: repoFontsCss,
        publicPath: entry.publicPath
      });
      const basePath = getBasePathFromSiteUrl(siteUrl);
      const prefixedEntryPublicPath = withBasePath(basePath, entry.publicPath);
      const withoutPrefixedPath = removeFontFaceBlocksByPublicPath({
        fontsCss: nextFontsCss,
        publicPath: prefixedEntryPublicPath
      });
      const fontsCssToWrite = withoutPrefixedPath.trim()
        ? withoutPrefixedPath
        : "/* no custom font faces */\n";

      await githubRequest("github-contents-write", {
        owner: repoContext.owner,
        repo: repoContext.repo,
        path: REPO_FONTS_CSS_PATH,
        message: `Remove font-face entries for ${entry.name}`,
        content: toBase64(new TextEncoder().encode(fontsCssToWrite).buffer),
        branch: repoContext.branch
      });

      applyRepoFontsCssUpdate({
        repoFullName: repoContext.repoFullName,
        branch: repoContext.branch,
        fontsCss: fontsCssToWrite
      });
      setNotice(`Removed ${entry.name}.`);
      setNoticeKind("notice");
      void refreshMediaAssets();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to remove font package.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setMediaRemovingFontPath(null);
    }
  }, [
    applyRepoFontsCssUpdate,
    draftState,
    refreshMediaAssets,
    repoFontsCss,
    setNotice,
    setNoticeKind,
    siteUrl
  ]);

  const selectedMediaFontFileName = useMemo(
    () => selectedMediaFontFile?.name ?? "",
    [selectedMediaFontFile]
  );

  return {
    selectedMediaFontFileName,
    setSelectedMediaFontFile,
    mediaFontFamilyName,
    setMediaFontFamilyName,
    mediaUploadingFont,
    mediaRemovingFontPath,
    handleUploadMediaFont,
    handleRemoveMediaFont
  };
};
