import { useEffect, useRef, type MouseEvent, type RefObject } from "react";
import BuilderFooterSection from "./BuilderFooterSection";
import BuilderHeaderSection from "./BuilderHeaderSection";
import LockAvatarPill from "./LockAvatarPill";
import BuilderPagesSection from "./BuilderPagesSection";
import BuilderMediaSection from "./BuilderMediaSection";
import BuilderStylesSection from "./BuilderStylesSection";
import type { PreviewSelectedElement, PreviewSelectedImage } from "./AstroTemplatePreview";
import type { RepoImageObject, RepoMediaFileEntry } from "../services/media-repo";
import type { PublishFeedback, SiteAccessRole } from "../services/types";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  BuilderStylesMode,
  FooterModule
} from "../services/types";

type BuilderSectionLock = {
  holderName: string;
  holderAvatarUrl: string | null;
  isSelf: boolean;
};

type PublishMode = "direct" | "pull_request";

type MediaFolderNode = {
  path: string;
  name: string;
  folders: Array<{ name: string; path: string }>;
  images: RepoImageObject[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

type BuilderSidebarProps = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  canEditDraft: boolean;
  accessRole: SiteAccessRole | null;
  activeCollaborators: string[];
  isPreviewFullscreen: boolean;
  canSaveDraft: boolean;
  savingDraft: boolean;
  canPublish: boolean;
  isProvisioning: boolean;
  provisionStep: string;
  publishFeedback: PublishFeedback | null;
  publishButtonLabel: string;
  publishMode: PublishMode;
  pages: BuilderPage[];
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  tokensCss: string;
  styleMode: BuilderStylesMode;
  advancedStructureCss: string;
  availableFonts: string[];
  fontsLoading: boolean;
  fontsError: string | null;
  mediaWarning: string | null;
  mediaError: string | null;
  mediaLoading: boolean;
  mediaCanonicalBaseUrl: string | null;
  mediaRootFolderNode: MediaFolderNode | null;
  mediaFolderNodes: Record<string, MediaFolderNode>;
  mediaImageUsageByKey: Record<string, Array<{ slug: string; title: string }>>;
  repoFontAssets: RepoMediaFileEntry[];
  selectedMediaImageFileNames: string[];
  mediaUploadingImages: boolean;
  mediaRemovingImageKey: string | null;
  mediaRenamingImageKey: string | null;
  selectedMediaFontFileName: string;
  mediaFontFamilyName: string;
  mediaUploadingFont: boolean;
  mediaRemovingFontPath: string | null;
  headerDisabled: boolean;
  headerFixed: boolean;
  headerBrandText: string;
  headerBrandDisabled: boolean;
  headerNavItems: Array<{
    slug: string;
    label: string;
  }>;
  footerDisabled: boolean;
  footerFixed: boolean;
  footerModules: FooterModule[];
  pageLocksBySlug: Record<string, BuilderSectionLock>;
  sectionLocks: Partial<Record<BuilderEditableSectionKey, BuilderSectionLock>>;
  onTogglePreviewFullscreen: () => void;
  onBackToMenu: () => void;
  onSettingsSectionChange: (section: BuilderSettingsSection) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onAddPage: () => void;
  onEnterPageEditingMode: (slug: string) => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
  onPageJavaScriptChange: (safeSlug: string, value: string) => void;
  onTokensCssChange: (value: string) => void;
  onStyleModeChange: (value: BuilderStylesMode) => void;
  onAdvancedStructureCssChange: (value: string) => void;
  onRefreshMediaAssets: () => void;
  onEnsureMediaFolderLoaded: (folderPath: string, folderName: string) => void;
  onImageFilesChange: (files: File[]) => void;
  onUploadImages: () => void;
  onRemoveImageObject: (imageObject: RepoImageObject) => void;
  onRenameImageObject: (imageObject: RepoImageObject, nextTitle: string) => void;
  onMediaFontFileChange: (file: File | null) => void;
  onMediaFontFamilyNameChange: (value: string) => void;
  onUploadMediaFont: () => void;
  onRemoveMediaFont: (entry: RepoMediaFileEntry) => void;
  onHeaderDisabledChange: (value: boolean) => void;
  onHeaderFixedChange: (value: boolean) => void;
  onHeaderBrandTextChange: (value: string) => void;
  onHeaderBrandDisabledChange: (value: boolean) => void;
  onMoveHeaderNavItemUp: (slug: string) => void;
  onMoveHeaderNavItemDown: (slug: string) => void;
  onFooterDisabledChange: (value: boolean) => void;
  onFooterFixedChange: (value: boolean) => void;
  onFooterModuleContentChange: (index: number, value: string) => void;
  onFooterModuleAlignmentChange: (index: number, value: "left" | "center" | "right") => void;
  onMoveFooterModuleUp: (index: number) => void;
  onMoveFooterModuleDown: (index: number) => void;
  selectedEditorImage: PreviewSelectedImage | null;
  selectedEditorElement: PreviewSelectedElement | null;
  onSelectedEditorImageAltChange: (value: string) => void;
  onSelectedEditorImageCaptionChange: (value: string) => void;
  onSelectedEditorImageSizeChange: (value: number) => void;
  onSelectedEditorElementClassNameChange: (value: string, elementId?: string) => void;
  onSelectedEditorElementInlineStyleChange: (value: string, elementId?: string) => void;
};

const BuilderSidebar = ({
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  canEditDraft,
  accessRole,
  activeCollaborators,
  isPreviewFullscreen,
  canSaveDraft,
  savingDraft,
  canPublish,
  isProvisioning,
  provisionStep,
  publishFeedback,
  publishButtonLabel,
  publishMode,
  pages,
  activePreviewSlug,
  pageTitleRef,
  tokensCss,
  styleMode,
  advancedStructureCss,
  availableFonts,
  fontsLoading,
  fontsError,
  mediaWarning,
  mediaError,
  mediaLoading,
  mediaCanonicalBaseUrl,
  mediaRootFolderNode,
  mediaFolderNodes,
  mediaImageUsageByKey,
  repoFontAssets,
  selectedMediaImageFileNames,
  mediaUploadingImages,
  mediaRemovingImageKey,
  mediaRenamingImageKey,
  selectedMediaFontFileName,
  mediaFontFamilyName,
  mediaUploadingFont,
  mediaRemovingFontPath,
  headerDisabled,
  headerFixed,
  headerBrandText,
  headerBrandDisabled,
  headerNavItems,
  footerDisabled,
  footerFixed,
  footerModules,
  pageLocksBySlug,
  sectionLocks,
  onTogglePreviewFullscreen,
  onBackToMenu,
  onSettingsSectionChange,
  onSaveDraft,
  onPublish,
  onAddPage,
  onEnterPageEditingMode,
  onPageTitleChange,
  onPageSlugChange,
  onPageJavaScriptChange,
  onTokensCssChange,
  onStyleModeChange,
  onAdvancedStructureCssChange,
  onRefreshMediaAssets,
  onEnsureMediaFolderLoaded,
  onImageFilesChange,
  onUploadImages,
  onRemoveImageObject,
  onRenameImageObject,
  onMediaFontFileChange,
  onMediaFontFamilyNameChange,
  onUploadMediaFont,
  onRemoveMediaFont,
  onHeaderDisabledChange,
  onHeaderFixedChange,
  onHeaderBrandTextChange,
  onHeaderBrandDisabledChange,
  onMoveHeaderNavItemUp,
  onMoveHeaderNavItemDown,
  onFooterDisabledChange,
  onFooterFixedChange,
  onFooterModuleContentChange,
  onFooterModuleAlignmentChange,
  onMoveFooterModuleUp,
  onMoveFooterModuleDown,
  selectedEditorImage,
  selectedEditorElement,
  onSelectedEditorImageAltChange,
  onSelectedEditorImageCaptionChange,
  onSelectedEditorImageSizeChange,
  onSelectedEditorElementClassNameChange,
  onSelectedEditorElementInlineStyleChange
}: BuilderSidebarProps) => {
  const sidebarShellRef = useRef<HTMLDivElement | null>(null);
  const headerLock = sectionLocks.header;
  const headerLockedByOther = Boolean(headerLock && !headerLock.isSelf);
  const footerLock = sectionLocks.footer;
  const footerLockedByOther = Boolean(footerLock && !footerLock.isSelf);
  const stylesLock = sectionLocks.styles;
  const stylesLockedByOther = Boolean(stylesLock && !stylesLock.isSelf);
  const mediaLock = sectionLocks.styles;
  const mediaLockedByOther = Boolean(mediaLock && !mediaLock.isSelf);
  const pagesLock = sectionLocks.pages;
  const pagesLockedByOther = Boolean(pagesLock && !pagesLock.isSelf);
  const activeSettingsLock =
    activeSettingsSection === "media" ? sectionLocks.styles : sectionLocks[activeSettingsSection];
  const activeSettingsLockedByOther = Boolean(activeSettingsLock && !activeSettingsLock.isSelf);
  const canEditPageJavaScript = accessRole === "owner" || accessRole === "admin";
  const inMainMenu = activeSection === "menu";
  const inSubmenu = activeSection === "settings";
  const backDestinationPath =
    activeSettingsSection === "pages" && isPageEditingMode ? "settings/pages" : "settings";
  const showPublishCta = canEditDraft && inMainMenu;
  const showSaveCta = canEditDraft && activeSection === "settings";
  const showPublishFeedback = showPublishCta && (isProvisioning || publishFeedback);
  const handleBackLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onBackToMenu();
  };

  useEffect(() => {
    const shell = sidebarShellRef.current;
    if (!shell) return;

    let animationFrame = 0;
    const updateShellHeight = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const shellRect = shell.getBoundingClientRect();
      const topInset = Math.max(shellRect.top, 0);
      const bottomInset = 16;
      const availableHeight = Math.max(0, Math.floor(viewportHeight - topInset - bottomInset));
      shell.style.setProperty("--builder-sidebar-shell-height", `${availableHeight}px`);
    };
    const scheduleShellHeightUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateShellHeight();
      });
    };

    updateShellHeight();
    window.addEventListener("scroll", scheduleShellHeightUpdate, { passive: true });
    window.addEventListener("resize", scheduleShellHeightUpdate);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleShellHeightUpdate();
          });
    resizeObserver?.observe(shell);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleShellHeightUpdate);
      window.removeEventListener("resize", scheduleShellHeightUpdate);
      resizeObserver?.disconnect();
      shell.style.removeProperty("--builder-sidebar-shell-height");
    };
  }, []);

  return (
    <div
      ref={sidebarShellRef}
      className={`builder-sidebar-shell ${isPreviewFullscreen ? "is-collapsed" : ""}`}
    >
      <aside className="builder-sidebar">
        <div className="builder-sidebar-fixed-header">
          {canEditDraft && inSubmenu && (
            <a className="builder-sidebar-back-link" href="#" onClick={handleBackLinkClick}>
              <span className="builder-sidebar-back-link-word">back</span>
              <span>to {backDestinationPath}</span>
            </a>
          )}
        </div>

        <div className="builder-sidebar-content">
          {canEditDraft && inMainMenu && (
            <div className="builder-sidebar-nav">
              <div className="builder-sidebar-nav-item">
                <button
                  className={`ghost ${pagesLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onSettingsSectionChange("pages")}
                  disabled={pagesLockedByOther && activeSettingsSection !== "pages"}
                >
                  <span className="builder-section-nav-label">Pages</span>
                </button>
                {pagesLock && !pagesLock.isSelf && (
                  <LockAvatarPill
                    holderName={pagesLock.holderName}
                    holderAvatarUrl={pagesLock.holderAvatarUrl}
                  />
                )}
              </div>
              <div className="builder-sidebar-nav-item">
                <button
                  className={`ghost ${headerLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onSettingsSectionChange("header")}
                  disabled={headerLockedByOther && activeSettingsSection !== "header"}
                >
                  <span className="builder-section-nav-label">Header</span>
                </button>
                {headerLock && !headerLock.isSelf && (
                  <LockAvatarPill
                    holderName={headerLock.holderName}
                    holderAvatarUrl={headerLock.holderAvatarUrl}
                  />
                )}
              </div>
              <div className="builder-sidebar-nav-item">
                <button
                  className={`ghost ${footerLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onSettingsSectionChange("footer")}
                  disabled={footerLockedByOther && activeSettingsSection !== "footer"}
                >
                  <span className="builder-section-nav-label">Footer</span>
                </button>
                {footerLock && !footerLock.isSelf && (
                  <LockAvatarPill
                    holderName={footerLock.holderName}
                    holderAvatarUrl={footerLock.holderAvatarUrl}
                  />
                )}
              </div>
              <div className="builder-sidebar-nav-item">
                <button
                  className={`ghost ${stylesLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onSettingsSectionChange("styles")}
                  disabled={stylesLockedByOther && activeSettingsSection !== "styles"}
                >
                  <span className="builder-section-nav-label">Styles</span>
                </button>
                {stylesLock && !stylesLock.isSelf && (
                  <LockAvatarPill
                    holderName={stylesLock.holderName}
                    holderAvatarUrl={stylesLock.holderAvatarUrl}
                  />
                )}
              </div>
              <div className="builder-sidebar-nav-item">
                <button
                  className={`ghost ${mediaLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onSettingsSectionChange("media")}
                  disabled={mediaLockedByOther && activeSettingsSection !== "media"}
                >
                  <span className="builder-section-nav-label">Media</span>
                </button>
                {mediaLock && !mediaLock.isSelf && (
                  <LockAvatarPill
                    holderName={mediaLock.holderName}
                    holderAvatarUrl={mediaLock.holderAvatarUrl}
                  />
                )}
              </div>
            </div>
          )}

          {activeSection === "menu" && (
            <div className="builder-section">
              <p className="builder-format-toolbar-note">
                {canEditDraft
                  ? "Choose a section to continue editing."
                  : "This draft is in read-only mode for your current role."}
              </p>
            </div>
          )}

          {activeSection === "settings" && canEditDraft && (
            <>
              {activeSettingsLockedByOther && (
                <p className="builder-section-lock-note">
                  {activeSettingsLock?.holderName ?? "Another user"} is editing this section.
                </p>
              )}

              <fieldset className="builder-locked-fieldset" disabled={activeSettingsLockedByOther}>
                {activeSettingsSection === "pages" && (
                  <>
                    <BuilderPagesSection
                      pages={pages}
                      pageLocksBySlug={pageLocksBySlug}
                      isPageEditingMode={isPageEditingMode}
                      activePreviewSlug={activePreviewSlug}
                      pageTitleRef={pageTitleRef}
                      onAddPage={onAddPage}
                      onEnterPageEditingMode={onEnterPageEditingMode}
                      onPageTitleChange={onPageTitleChange}
                      onPageSlugChange={onPageSlugChange}
                      onPageJavaScriptChange={onPageJavaScriptChange}
                      canEditPageJavaScript={canEditPageJavaScript}
                      isEditingDisabled={activeSettingsLockedByOther}
                      selectedEditorImage={selectedEditorImage}
                      selectedEditorElement={selectedEditorElement}
                      onSelectedEditorImageAltChange={onSelectedEditorImageAltChange}
                      onSelectedEditorImageCaptionChange={onSelectedEditorImageCaptionChange}
                      onSelectedEditorImageSizeChange={onSelectedEditorImageSizeChange}
                      onSelectedEditorElementClassNameChange={
                        onSelectedEditorElementClassNameChange
                      }
                      onSelectedEditorElementInlineStyleChange={
                        onSelectedEditorElementInlineStyleChange
                      }
                    />
                  </>
                )}

                {activeSettingsSection === "header" && (
                  <BuilderHeaderSection
                    disabled={headerDisabled}
                    fixed={headerFixed}
                    brandText={headerBrandText}
                    disableBrand={headerBrandDisabled}
                    navItems={headerNavItems}
                    onDisabledChange={onHeaderDisabledChange}
                    onFixedChange={onHeaderFixedChange}
                    onBrandTextChange={onHeaderBrandTextChange}
                    onDisableBrandChange={onHeaderBrandDisabledChange}
                    onMoveNavItemUp={onMoveHeaderNavItemUp}
                    onMoveNavItemDown={onMoveHeaderNavItemDown}
                  />
                )}

                {activeSettingsSection === "footer" && (
                  <BuilderFooterSection
                    disabled={footerDisabled}
                    fixed={footerFixed}
                    modules={footerModules}
                    onDisabledChange={onFooterDisabledChange}
                    onFixedChange={onFooterFixedChange}
                    onModuleContentChange={onFooterModuleContentChange}
                    onModuleAlignmentChange={onFooterModuleAlignmentChange}
                    onMoveModuleUp={onMoveFooterModuleUp}
                    onMoveModuleDown={onMoveFooterModuleDown}
                  />
                )}

                {activeSettingsSection === "styles" && (
                  <BuilderStylesSection
                    styleMode={styleMode}
                    tokensCss={tokensCss}
                    advancedStructureCss={advancedStructureCss}
                    availableFonts={availableFonts}
                    fontsLoading={fontsLoading}
                    fontsError={fontsError}
                    onTokensCssChange={onTokensCssChange}
                    onStyleModeChange={onStyleModeChange}
                    onAdvancedStructureCssChange={onAdvancedStructureCssChange}
                  />
                )}

                {activeSettingsSection === "media" && (
                  <BuilderMediaSection
                    mediaCanonicalBaseUrl={mediaCanonicalBaseUrl}
                    rootFolderNode={mediaRootFolderNode}
                    folderNodes={mediaFolderNodes}
                    imageUsageByKey={mediaImageUsageByKey}
                    fonts={repoFontAssets}
                    mediaLoading={mediaLoading}
                    mediaError={mediaError}
                    mediaWarning={mediaWarning}
                    selectedImageFileNames={selectedMediaImageFileNames}
                    uploadingImages={mediaUploadingImages}
                    removingImageKey={mediaRemovingImageKey}
                    renamingImageKey={mediaRenamingImageKey}
                    selectedFontFileName={selectedMediaFontFileName}
                    fontFamilyName={mediaFontFamilyName}
                    uploadingFont={mediaUploadingFont}
                    removingFontPath={mediaRemovingFontPath}
                    onRefresh={onRefreshMediaAssets}
                    onEnsureFolderLoaded={onEnsureMediaFolderLoaded}
                    onImageFilesChange={onImageFilesChange}
                    onUploadImages={onUploadImages}
                    onRemoveImageObject={onRemoveImageObject}
                    onRenameImageObject={onRenameImageObject}
                    onFontFileChange={onMediaFontFileChange}
                    onFontFamilyNameChange={onMediaFontFamilyNameChange}
                    onUploadFont={onUploadMediaFont}
                    onRemoveFont={onRemoveMediaFont}
                  />
                )}
              </fieldset>
            </>
          )}
        </div>

        {(showPublishCta || showSaveCta) && (
          <div className="builder-sidebar-publish">
            {showPublishCta && (
              <>
                <div className="builder-collab-strip" aria-live="polite">
                  <span className="builder-collab-pill">
                    {accessRole === "owner" ? "Owner access" : `Role: ${accessRole ?? "none"}`}
                  </span>
                  <span className="builder-collab-pill">
                    {activeCollaborators.length
                      ? `${activeCollaborators.length} active now`
                      : "No one else active"}
                  </span>
                  {activeCollaborators.slice(0, 3).map((name, index) => (
                    <span key={`${name}-${index}`} className="builder-collab-name">
                      {name}
                    </span>
                  ))}
                </div>
                <p className="builder-sidebar-publish-note">
                  Publish the whole site when it's ready to go live.
                </p>
                <button className="primary" type="button" onClick={onPublish} disabled={!canPublish}>
                  {isProvisioning
                    ? `${publishButtonLabel}...`
                    : publishFeedback?.kind === "progress"
                      ? "Building..."
                      : publishButtonLabel}
                </button>
              </>
            )}

            {showSaveCta && (
              <button className="ghost" type="button" onClick={onSaveDraft} disabled={!canSaveDraft}>
                {savingDraft ? "Saving..." : "Save"}
              </button>
            )}

            {showPublishFeedback && (
              <div
                className={`builder-publish-feedback ${
                  isProvisioning
                    ? ""
                    : publishFeedback?.kind === "error"
                      ? "is-error"
                      : publishFeedback?.kind === "success"
                        ? "is-success"
                        : ""
                }`}
              >
                <span>{isProvisioning ? "Publishing your site..." : publishFeedback?.text}</span>
                {isProvisioning && <span>{provisionStep}</span>}
                {!isProvisioning && publishFeedback?.runUrl && (
                  <a href={publishFeedback.runUrl} target="_blank" rel="noopener noreferrer">
                    {publishMode === "pull_request"
                      ? "View pull request"
                      : publishFeedback.kind === "progress"
                        ? "View actions"
                        : "View build"}
                  </a>
                )}
                {!isProvisioning && publishFeedback?.pagesUrl && publishFeedback.kind === "success" && (
                  <a href={publishFeedback.pagesUrl} target="_blank" rel="noopener noreferrer">
                    Open site
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      <button
        className="builder-sidebar-toggle-tab"
        type="button"
        aria-label={isPreviewFullscreen ? "Show sidebar" : "Hide sidebar"}
        onClick={onTogglePreviewFullscreen}
      >
        {isPreviewFullscreen ? ">" : "<"}
      </button>
    </div>
  );
};

export default BuilderSidebar;
