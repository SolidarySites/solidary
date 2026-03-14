import type { Dispatch, RefObject, SetStateAction } from "react";
import type { BuilderContentSectionProps } from "../../../../site-settings/components/BuilderContentSection";
import type { BuilderSidebarProps } from "../../../chrome/BuilderSidebar";
import type { BuilderTopbarProps } from "../../../chrome/BuilderTopbar";
import type { DomainDnsFeedbackState, SiteDeleteMode } from "../../live-settings/types";
import type { AstroTemplatePreviewHandle, PreviewSelectedElement, PreviewSelectedImage } from "../../../preview/AstroTemplatePreview";
import type { BuilderPreviewPanelProps } from "../../../preview/BuilderPreviewPanel";
import type { RepoImageObject, RepoMediaFileEntry } from "../../../services/media-repo";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  BuilderStyleSettings,
  BuilderStylesMode,
  CollaboratorRole,
  CollaboratorSearchResult,
  DraftImageAsset,
  DraftState,
  FooterModule,
  ManagedCollaborator,
  PublishFeedback,
  SiteAccessRole
} from "../../../services/types";

export type BuilderSectionLockViewModel = {
  holderName: string;
  holderAvatarUrl: string | null;
  isSelf: boolean;
};

export type MediaFolderNodeViewModel = {
  path: string;
  name: string;
  folders: Array<{ name: string; path: string }>;
  images: RepoImageObject[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export type BuilderDocumentStateViewModelSource = {
  siteTitle: string;
  setSiteTitle: (value: string) => void;
  siteDescription: string;
  setSiteDescription: (value: string) => void;
  siteUrl: string;
  setSiteUrl: (value: string) => void;
  dynamicImageLoadingEnabled: boolean;
  setDynamicImageLoadingEnabled: (value: boolean) => void;
  setSiteImage: (value: File | null) => void;
  siteImagePreview: string | null;
  pages: BuilderPage[];
  draftImages: DraftImageAsset[];
  activePreviewSlug: string;
  headerDisabled: boolean;
  setHeaderDisabled: (value: boolean) => void;
  headerFixed: boolean;
  setHeaderFixed: (value: boolean) => void;
  headerBrandText: string;
  setHeaderBrandText: (value: string) => void;
  headerBrandDisabled: boolean;
  setHeaderBrandDisabled: (value: boolean) => void;
  footerDisabled: boolean;
  setFooterDisabled: (value: boolean) => void;
  footerFixed: boolean;
  setFooterFixed: (value: boolean) => void;
  footerModules: FooterModule[];
  headHtml: string;
  setHeadHtml: (value: string) => void;
  seoLocale: string;
  setSeoLocale: (value: string) => void;
  seoTwitter: boolean;
  setSeoTwitter: (value: boolean) => void;
  seoOpenGraph: boolean;
  setSeoOpenGraph: (value: boolean) => void;
  seoStructuredData: boolean;
  setSeoStructuredData: (value: boolean) => void;
  seoIndexFollow: boolean;
  setSeoIndexFollow: (value: boolean) => void;
};

export type BuilderCollaboratorsViewModelSource = {
  collaboratorQuery: string;
  collaboratorRole: CollaboratorRole;
  collaboratorSuggestions: CollaboratorSearchResult[];
  selectedCollaboratorSuggestion: CollaboratorSearchResult | null;
  collaboratorSearchLoading: boolean;
  invitingCollaborator: boolean;
  managedCollaborators: ManagedCollaborator[];
  managedCollaboratorsLoading: boolean;
  updatingCollaboratorUserId: string | null;
  setCollaboratorRole: (value: CollaboratorRole) => void;
  handleCollaboratorQueryChange: (value: string) => void;
  handleCollaboratorSuggestionSelect: (suggestion: CollaboratorSearchResult) => void;
  handleInviteCollaborator: () => Promise<void>;
  handleCollaboratorRoleUpdate: (collaboratorUserId: string, role: CollaboratorRole) => Promise<void>;
  handleCollaboratorRemove: (collaboratorUserId: string) => Promise<void>;
};

export type BuilderPreviewEditorViewModelSource = {
  previewRef: RefObject<AstroTemplatePreviewHandle | null>;
  selectedEditorImage: PreviewSelectedImage | null;
  selectedEditorElement: PreviewSelectedElement | null;
  setSelectedEditorImage: Dispatch<SetStateAction<PreviewSelectedImage | null>>;
  setSelectedEditorElement: Dispatch<SetStateAction<PreviewSelectedElement | null>>;
  uploadingInlineImage: boolean;
  runPreviewCommand: (command: string, value?: string) => void;
  runPreviewLink: () => void;
  capturePreviewSelection: () => void;
  handleInlineImageUpload: BuilderTopbarProps["onUploadFormatImage"];
  handleSelectedEditorImageAltChange: (value: string) => void;
  handleSelectedEditorImageCaptionChange: (value: string) => void;
  handleSelectedEditorImageSizeChange: (value: number) => void;
  handleSelectedEditorElementClassNameChange: (value: string, elementId?: string) => void;
  handleSelectedEditorElementInlineStyleChange: (value: string, elementId?: string) => void;
};

export type BuilderPageEditingViewModelSource = {
  addPage: () => void;
  updatePageBody: (safeSlug: string, body: string) => void;
  updatePageJavaScript: (safeSlug: string, value: string) => void;
  handlePageTitleChange: (index: number, value: string) => void;
  handlePageSlugChange: (index: number, value: string) => void;
  headerNavItems: Array<{
    slug: string;
    label: string;
  }>;
  moveHeaderNavItem: (slug: string, direction: -1 | 1) => void;
  updateFooterModuleContent: (index: number, value: string) => void;
  updateFooterModuleAlignment: (index: number, value: "left" | "center" | "right") => void;
  moveFooterModule: (index: number, direction: -1 | 1) => void;
};

export type BuilderStyleMediaViewModelSource = {
  tokensCss: string;
  setTokensCss: (value: string) => void;
  styleMode: BuilderStylesMode;
  handleStyleModeChange: (value: BuilderStylesMode) => void;
  advancedStructureCss: string;
  setAdvancedStructureCss: (value: string) => void;
  repoFontsCss: string;
  fontsLoading: boolean;
  fontsError: string | null;
  mobilePreviewEnabled: boolean;
  setMobilePreviewEnabled: (value: boolean) => void;
  availableFontsForControls: string[];
  styleSettings: BuilderStyleSettings;
  previewStylesCss: string;
  mediaWarning: string | null;
  mediaError: string | null;
  mediaLoading: boolean;
  mediaCanonicalBaseUrl: string | null;
  mediaRootFolderNode: MediaFolderNodeViewModel | null;
  mediaFolderNodes: Record<string, MediaFolderNodeViewModel>;
  mediaImageUsageByKey: Record<string, Array<{ slug: string; title: string }>>;
  repoFontAssets: RepoMediaFileEntry[];
  selectedMediaImageFileNames: string[];
  setSelectedMediaImageFiles: (files: File[]) => void;
  mediaUploadingImages: boolean;
  mediaRemovingImageKey: string | null;
  mediaRenamingImageKey: string | null;
  selectedMediaFontFileName: string;
  setSelectedMediaFontFile: (file: File | null) => void;
  mediaFontFamilyName: string;
  setMediaFontFamilyName: (value: string) => void;
  mediaUploadingFont: boolean;
  mediaRemovingFontPath: string | null;
  refreshMediaAssets: () => Promise<void>;
  ensureMediaFolderLoaded: (folderPath: string, folderName: string) => void;
  handleUploadMediaImages: () => Promise<void>;
  handleRemoveMediaImageObject: (imageObject: RepoImageObject) => Promise<void>;
  handleRenameMediaImageObject: (imageObject: RepoImageObject, nextTitle: string) => Promise<void>;
  handleUploadMediaFont: () => Promise<void>;
  handleRemoveMediaFont: (entry: RepoMediaFileEntry) => Promise<void>;
  previewAssetBaseUrl: string | null;
};

export type BuilderLiveSettingsViewModelSource = {
  deleteMode: SiteDeleteMode | null;
  setDeleteMode: Dispatch<SetStateAction<SiteDeleteMode | null>>;
  deleteConfirmText: string;
  setDeleteConfirmText: Dispatch<SetStateAction<string>>;
  deleteBusy: boolean;
  domainActionBusy: "none" | "github" | "reset" | "studio";
  domainDnsFeedback: DomainDnsFeedbackState | null;
  showGithubPagesDomainConnect: boolean;
  defaultGitHubPagesUrl: string | null;
  canResetGitHubPagesDomain: boolean;
  savingGeneralSettingsToLive: boolean;
  savingConnectionsToLive: boolean;
  canSaveGeneralSettingsToLive: boolean;
  canSaveConnectionsSettingsToLive: boolean;
  saveGeneralDraftSilently: () => Promise<boolean>;
  saveGeneralSettingsToLive: () => Promise<void>;
  saveConnectionsToLive: () => Promise<void>;
  handleStudioOnlyDomainUpdate: (value: string) => Promise<void>;
  handleConnectGithubDomain: (value: string) => Promise<void>;
  handleRecheckGithubDomain: (value: string) => Promise<void>;
  handleResetGithubDomain: () => Promise<void>;
  handleDeleteSite: () => Promise<void>;
};

export type SettingsRouteContext = {
  draftId: string | null;
  sessionUserId: string | null;
  canEditDraft: boolean;
  sessionDisplayName: string;
  sessionAvatarUrl: string | null;
  siteAccessRole: SiteAccessRole | null;
  canAccessSettingsPage: boolean;
  hasUnsavedChanges: boolean;
  savingDraft: boolean;
  saveGeneralDraftSilently: () => Promise<boolean>;
  canSaveGeneralSettingsToLive: boolean;
  canSaveConnectionsSettingsToLive: boolean;
  savingGeneralSettingsToLive: boolean;
  savingConnectionsToLive: boolean;
  saveGeneralSettingsToLive: () => void;
  saveConnectionsSettingsToLive: () => void;
};

export type BuilderContentSectionBaseProps = Omit<
  BuilderContentSectionProps,
  "draftId" | "activeSection" | "activeSectionLockedByOther" | "activeSectionLockHolderName" | "ownerAccess"
>;

export type BuildSiteBuilderViewModelsOptions = {
  draftId: string | null;
  draftState: DraftState | null;
  canDeleteSite: boolean;
  deleteSiteRepoFullName: string;
  sessionUserId: string | null;
  canEditDraft: boolean;
  sessionDisplayName: string;
  sessionAvatarUrl: string | null;
  siteAccessRole: SiteAccessRole | null;
  hasUnsavedChanges: boolean;
  savingDraft: boolean;
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  showMetadataFullView: boolean;
  metadataLockedByOther: boolean;
  metadataLockHolderName: string;
  canEditPageContent: boolean;
  canPublishByRole: boolean;
  canDirectPublish: boolean;
  hasForeignSectionLocks: boolean;
  activeEditableSection: BuilderEditableSectionKey | null;
  activeSectionLockedByOther: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  publishFeedback: PublishFeedback | null;
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  draftLoadError: string | null;
  isPreviewFullscreen: boolean;
  setIsPreviewFullscreen: Dispatch<SetStateAction<boolean>>;
  documentState: BuilderDocumentStateViewModelSource;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  collaborators: BuilderCollaboratorsViewModelSource;
  collaboratorPresenceNames: string[];
  previewEditor: BuilderPreviewEditorViewModelSource;
  pageEditing: BuilderPageEditingViewModelSource;
  styleMedia: BuilderStyleMediaViewModelSource;
  liveSettings: BuilderLiveSettingsViewModelSource;
  pageLocksBySlug: Record<string, BuilderSectionLockViewModel>;
  sidebarSectionLocks: Partial<Record<BuilderEditableSectionKey, BuilderSectionLockViewModel>>;
  publishedSiteBaseUrl: string | null;
  defaultHomeContent: string;
  pageDeleteBusy: boolean;
  handleDeletePage: (safeSlug: string) => Promise<void>;
  handleEnterPageEditingMode: (slug: string) => Promise<void>;
  handleSaveDraft: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleSectionChange: (section: BuilderSection) => Promise<void>;
  handleSettingsSectionChange: (section: BuilderSettingsSection) => Promise<void>;
  handleExitPageEditingMode: () => Promise<void>;
  handleActivePreviewSlugChange: (slug: string) => Promise<void>;
  maxFormatImageUploadBytes: number;
};

export type SiteBuilderViewModels = {
  settingsRouteContext: SettingsRouteContext;
  showMetadataFullView: boolean;
  metadataLockedByOther: boolean;
  metadataLockHolderName: string;
  showTopbar: boolean;
  showPreviewPanel: boolean;
  bodyClassName: string;
  topbarProps: BuilderTopbarProps;
  contentSectionProps: BuilderContentSectionBaseProps;
  sidebarProps: BuilderSidebarProps;
  previewPanelProps: BuilderPreviewPanelProps;
};
