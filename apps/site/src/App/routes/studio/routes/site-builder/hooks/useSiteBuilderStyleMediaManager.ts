import type { MutableRefObject } from "react";
import type { NoticeKind } from "../../../../../types/notice";
import type {
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  DraftState
} from "../services/types";
import { useMediaFontActions } from "./style-media/useMediaFontActions";
import { useMediaImageActions } from "./style-media/useMediaImageActions";
import { useMediaLibrary } from "./style-media/useMediaLibrary";
import { useRepoStyleAssets } from "./style-media/useRepoStyleAssets";
import { defaultStyleMode, useStyleSettingsState } from "./style-media/useStyleSettingsState";

type UseSiteBuilderStyleMediaManagerOptions = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  draftState: DraftState | null;
  siteUrl: string;
  publishedSiteBaseUrl: string | null;
  pages: BuilderPage[];
  hasUnsavedChangesRef: MutableRefObject<boolean>;
  shouldCaptureLoadedDraftSignatureRef: MutableRefObject<boolean>;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

export { defaultStyleMode };

export const useSiteBuilderStyleMediaManager = ({
  activeSection,
  activeSettingsSection,
  draftState,
  siteUrl,
  publishedSiteBaseUrl,
  pages,
  hasUnsavedChangesRef,
  shouldCaptureLoadedDraftSignatureRef,
  setNotice,
  setNoticeKind
}: UseSiteBuilderStyleMediaManagerOptions) => {
  const styleState = useStyleSettingsState();
  const repoStyleAssets = useRepoStyleAssets({
    activeSection,
    activeSettingsSection,
    draftState,
    baseStructureCss: styleState.baseStructureCss,
    baseGlobalCss: styleState.baseGlobalCss,
    setBaseStructureCss: styleState.setBaseStructureCss,
    setBaseGlobalCss: styleState.setBaseGlobalCss,
    hasUnsavedChangesRef,
    shouldCaptureLoadedDraftSignatureRef
  });
  const mediaLibrary = useMediaLibrary({
    activeSection,
    activeSettingsSection,
    draftState,
    pages,
    siteUrl,
    publishedSiteBaseUrl
  });
  const mediaImageActions = useMediaImageActions({
    draftState,
    refreshMediaAssets: mediaLibrary.refreshMediaAssets,
    setNotice,
    setNoticeKind
  });
  const mediaFontActions = useMediaFontActions({
    draftState,
    siteUrl,
    repoFontsCss: repoStyleAssets.repoFontsCss,
    applyRepoFontsCssUpdate: repoStyleAssets.applyRepoFontsCssUpdate,
    refreshMediaAssets: mediaLibrary.refreshMediaAssets,
    setNotice,
    setNoticeKind
  });

  return {
    tokensCss: styleState.tokensCss,
    setTokensCss: styleState.setTokensCss,
    styleMode: styleState.styleMode,
    setStyleMode: styleState.setStyleMode,
    handleStyleModeChange: styleState.handleStyleModeChange,
    advancedStructureCss: styleState.advancedStructureCss,
    setAdvancedStructureCss: styleState.setAdvancedStructureCss,
    baseStructureCss: styleState.baseStructureCss,
    setBaseStructureCss: styleState.setBaseStructureCss,
    baseGlobalCss: styleState.baseGlobalCss,
    setBaseGlobalCss: styleState.setBaseGlobalCss,
    repoFontsCss: repoStyleAssets.repoFontsCss,
    fontsLoading: repoStyleAssets.fontsLoading,
    fontsError: repoStyleAssets.fontsError,
    mobilePreviewEnabled: styleState.mobilePreviewEnabled,
    setMobilePreviewEnabled: styleState.setMobilePreviewEnabled,
    availableFontsForControls: repoStyleAssets.availableFontsForControls,
    styleSettings: styleState.styleSettings,
    previewStylesCss: styleState.previewStylesCss,
    mediaWarning: mediaLibrary.mediaWarning,
    mediaError: mediaLibrary.mediaError,
    mediaLoading: mediaLibrary.mediaLoading,
    mediaCanonicalBaseUrl: mediaLibrary.mediaCanonicalBaseUrl,
    mediaRootFolderNode: mediaLibrary.mediaRootFolderNode,
    mediaFolderNodes: mediaLibrary.mediaFolderNodes,
    mediaImageUsageByKey: mediaLibrary.mediaImageUsageByKey,
    repoFontAssets: mediaLibrary.repoFontAssets,
    selectedMediaImageFileNames: mediaImageActions.selectedMediaImageFileNames,
    setSelectedMediaImageFiles: mediaImageActions.setSelectedMediaImageFiles,
    mediaUploadingImages: mediaImageActions.mediaUploadingImages,
    mediaRemovingImageKey: mediaImageActions.mediaRemovingImageKey,
    mediaRenamingImageKey: mediaImageActions.mediaRenamingImageKey,
    selectedMediaFontFileName: mediaFontActions.selectedMediaFontFileName,
    setSelectedMediaFontFile: mediaFontActions.setSelectedMediaFontFile,
    mediaFontFamilyName: mediaFontActions.mediaFontFamilyName,
    setMediaFontFamilyName: mediaFontActions.setMediaFontFamilyName,
    mediaUploadingFont: mediaFontActions.mediaUploadingFont,
    mediaRemovingFontPath: mediaFontActions.mediaRemovingFontPath,
    refreshMediaAssets: mediaLibrary.refreshMediaAssets,
    ensureMediaFolderLoaded: mediaLibrary.ensureMediaFolderLoaded,
    handleUploadMediaImages: mediaImageActions.handleUploadMediaImages,
    handleRemoveMediaImageObject: mediaImageActions.handleRemoveMediaImageObject,
    handleRenameMediaImageObject: mediaImageActions.handleRenameMediaImageObject,
    handleUploadMediaFont: mediaFontActions.handleUploadMediaFont,
    handleRemoveMediaFont: mediaFontActions.handleRemoveMediaFont,
    previewAssetBaseUrl: mediaLibrary.previewAssetBaseUrl
  };
};
