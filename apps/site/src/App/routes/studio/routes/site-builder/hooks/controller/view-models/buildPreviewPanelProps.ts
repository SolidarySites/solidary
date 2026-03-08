import type { BuilderPreviewPanelProps } from "../../../preview/BuilderPreviewPanel";
import type { BuildSiteBuilderViewModelsOptions } from "./types";

type BuildPreviewPanelPropsOptions = Pick<
  BuildSiteBuilderViewModelsOptions,
  | "shouldLoadDraft"
  | "isDraftLoading"
  | "draftLoadError"
  | "canEditPageContent"
  | "activeSection"
  | "activeSettingsSection"
  | "styleMedia"
  | "previewEditor"
  | "documentState"
  | "defaultHomeContent"
  | "publishedSiteBaseUrl"
  | "handleActivePreviewSlugChange"
  | "pageEditing"
>;

export const buildPreviewPanelProps = ({
  shouldLoadDraft,
  isDraftLoading,
  draftLoadError,
  canEditPageContent,
  activeSection,
  activeSettingsSection,
  styleMedia,
  previewEditor,
  documentState,
  defaultHomeContent,
  publishedSiteBaseUrl,
  handleActivePreviewSlugChange,
  pageEditing
}: BuildPreviewPanelPropsOptions): BuilderPreviewPanelProps => ({
  shouldLoadDraft,
  isDraftLoading,
  draftLoadError,
  canEditContent: canEditPageContent,
  showStylesHoverInspector: activeSection === "settings" && activeSettingsSection === "styles",
  mobilePreviewEnabled: styleMedia.mobilePreviewEnabled,
  previewRef: previewEditor.previewRef,
  headHtml: documentState.headHtml,
  previewBrand: documentState.siteTitle,
  pages: documentState.pages,
  draftImages: documentState.draftImages,
  repoFontsCss: styleMedia.repoFontsCss,
  tokensCss: styleMedia.tokensCss,
  styleMode: styleMedia.styleMode,
  advancedStructureCss: styleMedia.advancedStructureCss,
  previewStylesCss: styleMedia.previewStylesCss,
  homeFallbackBody: defaultHomeContent,
  activePreviewSlug: documentState.activePreviewSlug,
  publishedSiteBaseUrl,
  previewAssetBaseUrl: styleMedia.previewAssetBaseUrl,
  header: {
    disabled: documentState.headerDisabled,
    fixed: documentState.headerFixed,
    brandText: documentState.headerBrandText,
    disableBrand: documentState.headerBrandDisabled
  },
  footer: {
    disabled: documentState.footerDisabled,
    fixed: documentState.footerFixed,
    modules: documentState.footerModules
  },
  onActivePreviewSlugChange: (slug) => {
    void handleActivePreviewSlugChange(slug);
  },
  onPageBodyChange: pageEditing.updatePageBody,
  onSelectedImageChange: previewEditor.setSelectedEditorImage,
  onSelectedElementChange: previewEditor.setSelectedEditorElement
});
