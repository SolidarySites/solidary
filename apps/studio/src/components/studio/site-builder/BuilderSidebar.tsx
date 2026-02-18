import type { RefObject } from "react";
import BuilderContentSection from "./BuilderContentSection";
import BuilderEditorToolbar from "./BuilderEditorToolbar";
import BuilderFooterSection from "./BuilderFooterSection";
import BuilderHeaderSection from "./BuilderHeaderSection";
import BuilderImageSettingsPanel from "./BuilderImageSettingsPanel";
import BuilderPagesSection from "./BuilderPagesSection";
import BuilderStylesSection from "./BuilderStylesSection";
import type { PreviewSelectedImage } from "../AstroTemplatePreview";
import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator,
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  FooterModule
} from "./types";

type BuilderSectionLock = {
  holderName: string;
  isSelf: boolean;
};

type BuilderSidebarProps = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  canEditDraft: boolean;
  canEditMetadata: boolean;
  siteTitle: string;
  siteDescription: string;
  siteImagePreview: string | null;
  collaboratorQuery: string;
  collaboratorRole: CollaboratorRole;
  collaboratorSuggestions: CollaboratorSearchResult[];
  selectedCollaboratorSuggestion: CollaboratorSearchResult | null;
  collaboratorSearchLoading: boolean;
  invitingCollaborator: boolean;
  collaborators: ManagedCollaborator[];
  collaboratorsLoading: boolean;
  updatingCollaboratorUserId: string | null;
  pages: BuilderPage[];
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  tokensCss: string;
  siteUrl: string;
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
  onBack: () => void;
  onSectionChange: (section: BuilderSection) => void;
  onSettingsSectionChange: (section: BuilderSettingsSection) => void;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteImageChange: (file: File | null) => void;
  onCollaboratorQueryChange: (value: string) => void;
  onCollaboratorRoleChange: (value: CollaboratorRole) => void;
  onCollaboratorSuggestionSelect: (suggestion: CollaboratorSearchResult) => void;
  onInviteCollaborator: () => void;
  onCollaboratorRoleUpdate: (userId: string, role: CollaboratorRole) => void;
  onCollaboratorRemove: (userId: string) => void;
  onAddPage: () => void;
  onActivePreviewSlugChange: (slug: string) => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
  onPageShowInNavChange: (index: number, checked: boolean) => void;
  onRemovePage: (index: number) => void;
  onTokensCssChange: (value: string) => void;
  onSiteUrlChange: (value: string) => void;
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
  canFormatText: boolean;
  onRunFormatCommand: (command: string, value?: string) => void;
  onRunFormatLink: () => void;
  onUploadFormatImage: (file: File) => Promise<void>;
  onCaptureFormatSelection: () => void;
  isFormatImageUploading: boolean;
  maxFormatImageUploadBytes: number;
  selectedEditorImage: PreviewSelectedImage | null;
  onSelectedEditorImageAltChange: (value: string) => void;
  onSelectedEditorImageCaptionChange: (value: string) => void;
  onSelectedEditorImageSizeChange: (value: number) => void;
};

const BuilderSidebar = ({
  activeSection,
  activeSettingsSection,
  canEditDraft,
  canEditMetadata,
  siteTitle,
  siteDescription,
  siteImagePreview,
  collaboratorQuery,
  collaboratorRole,
  collaboratorSuggestions,
  selectedCollaboratorSuggestion,
  collaboratorSearchLoading,
  invitingCollaborator,
  collaborators,
  collaboratorsLoading,
  updatingCollaboratorUserId,
  pages,
  activePreviewSlug,
  pageTitleRef,
  tokensCss,
  siteUrl,
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
  onBack,
  onSectionChange,
  onSettingsSectionChange,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteImageChange,
  onCollaboratorQueryChange,
  onCollaboratorRoleChange,
  onCollaboratorSuggestionSelect,
  onInviteCollaborator,
  onCollaboratorRoleUpdate,
  onCollaboratorRemove,
  onAddPage,
  onActivePreviewSlugChange,
  onPageTitleChange,
  onPageSlugChange,
  onPageShowInNavChange,
  onRemovePage,
  onTokensCssChange,
  onSiteUrlChange,
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
  canFormatText,
  onRunFormatCommand,
  onRunFormatLink,
  onUploadFormatImage,
  onCaptureFormatSelection,
  isFormatImageUploading,
  maxFormatImageUploadBytes,
  selectedEditorImage,
  onSelectedEditorImageAltChange,
  onSelectedEditorImageCaptionChange,
  onSelectedEditorImageSizeChange
}: BuilderSidebarProps) => {
  const metadataLock = sectionLocks.metadata;
  const metadataLockedByOther = Boolean(metadataLock && !metadataLock.isSelf);
  const headerLock = sectionLocks.header;
  const headerLockedByOther = Boolean(headerLock && !headerLock.isSelf);
  const footerLock = sectionLocks.footer;
  const footerLockedByOther = Boolean(footerLock && !footerLock.isSelf);
  const stylesLock = sectionLocks.styles;
  const stylesLockedByOther = Boolean(stylesLock && !stylesLock.isSelf);
  const activeSettingsLock = sectionLocks[activeSettingsSection];
  const activeSettingsLockedByOther = Boolean(activeSettingsLock && !activeSettingsLock.isSelf);

  return (
    <aside className="builder-sidebar">
      <button className="ghost" type="button" onClick={onBack}>
        BACK
      </button>

      {activeSection === "menu" && (
        <>
          <div className="builder-sidebar-nav">
            {canEditMetadata && (
              <button
                className={`ghost ${metadataLockedByOther ? "is-locked" : ""}`.trim()}
                onClick={() => onSectionChange("content")}
                disabled={metadataLockedByOther}
              >
                Solidary Metadata
              </button>
            )}
            {canEditDraft && (
              <button className="ghost" onClick={() => onSectionChange("settings")}>
                Settings
              </button>
            )}
          </div>
          {metadataLockedByOther && (
            <p className="builder-section-lock-note">
              Solidary Metadata is currently being edited by {metadataLock?.holderName ?? "another user"}.
            </p>
          )}

          {canEditDraft ? (
            <>
              <div className="builder-section builder-format-toolbar">
                {canFormatText ? (
                  <BuilderEditorToolbar
                    onRunCommand={onRunFormatCommand}
                    onRunLink={onRunFormatLink}
                    onUploadImage={onUploadFormatImage}
                    onCaptureSelection={onCaptureFormatSelection}
                    uploadingImage={isFormatImageUploading}
                    maxImageUploadBytes={maxFormatImageUploadBytes}
                  />
                ) : (
                  <p className="builder-format-toolbar-note">
                    Open Pages to edit content when that section is available.
                  </p>
                )}
              </div>
              <BuilderImageSettingsPanel
                image={selectedEditorImage}
                onAltChange={onSelectedEditorImageAltChange}
                onCaptionChange={onSelectedEditorImageCaptionChange}
                onSizeChange={onSelectedEditorImageSizeChange}
              />
            </>
          ) : (
            <div className="builder-section">
              <p className="builder-format-toolbar-note">
                This draft is in read-only mode for your current role.
              </p>
            </div>
          )}
        </>
      )}

      {activeSection === "content" && (
        <div className={`builder-section-lock-shell ${metadataLockedByOther ? "is-locked" : ""}`.trim()}>
          {metadataLockedByOther && (
            <p className="builder-section-lock-note">
              {metadataLock?.holderName ?? "Another user"} is editing this section.
            </p>
          )}
          <fieldset className="builder-locked-fieldset" disabled={metadataLockedByOther}>
            <BuilderContentSection
              siteTitle={siteTitle}
              siteDescription={siteDescription}
              siteUrl={siteUrl}
              siteImagePreview={siteImagePreview}
              collaboratorQuery={collaboratorQuery}
              collaboratorRole={collaboratorRole}
              collaboratorSuggestions={collaboratorSuggestions}
              selectedCollaboratorSuggestion={selectedCollaboratorSuggestion}
              collaboratorSearchLoading={collaboratorSearchLoading}
              invitingCollaborator={invitingCollaborator}
              collaborators={collaborators}
              collaboratorsLoading={collaboratorsLoading}
              updatingCollaboratorUserId={updatingCollaboratorUserId}
              onSiteTitleChange={onSiteTitleChange}
              onSiteDescriptionChange={onSiteDescriptionChange}
              onSiteUrlChange={onSiteUrlChange}
              onSiteImageChange={onSiteImageChange}
              onCollaboratorQueryChange={onCollaboratorQueryChange}
              onCollaboratorRoleChange={onCollaboratorRoleChange}
              onCollaboratorSuggestionSelect={onCollaboratorSuggestionSelect}
              onInviteCollaborator={onInviteCollaborator}
              onCollaboratorRoleUpdate={onCollaboratorRoleUpdate}
              onCollaboratorRemove={onCollaboratorRemove}
            />
          </fieldset>
        </div>
      )}

      {activeSection === "settings" && canEditDraft && (
        <>
          <div className="builder-sidebar-nav">
            <button
              className={`${activeSettingsSection === "pages" ? "primary" : "ghost"}`.trim()}
              onClick={() => onSettingsSectionChange("pages")}
            >
              Pages
            </button>
            <button
              className={`${activeSettingsSection === "header" ? "primary" : "ghost"} ${
                headerLockedByOther ? "is-locked" : ""
              }`.trim()}
              onClick={() => onSettingsSectionChange("header")}
              disabled={headerLockedByOther && activeSettingsSection !== "header"}
            >
              Header
            </button>
            <button
              className={`${activeSettingsSection === "footer" ? "primary" : "ghost"} ${
                footerLockedByOther ? "is-locked" : ""
              }`.trim()}
              onClick={() => onSettingsSectionChange("footer")}
              disabled={footerLockedByOther && activeSettingsSection !== "footer"}
            >
              Footer
            </button>
            <button
              className={`${activeSettingsSection === "styles" ? "primary" : "ghost"} ${
                stylesLockedByOther ? "is-locked" : ""
              }`.trim()}
              onClick={() => onSettingsSectionChange("styles")}
              disabled={stylesLockedByOther && activeSettingsSection !== "styles"}
            >
              Styles
            </button>
          </div>

          {activeSettingsLockedByOther && (
            <p className="builder-section-lock-note">
              {activeSettingsLock?.holderName ?? "Another user"} is editing this section.
            </p>
          )}

          <fieldset className="builder-locked-fieldset" disabled={activeSettingsLockedByOther}>
            {activeSettingsSection === "pages" && (
              <BuilderPagesSection
                pages={pages}
                pageLocksBySlug={pageLocksBySlug}
                activePreviewSlug={activePreviewSlug}
                pageTitleRef={pageTitleRef}
                onAddPage={onAddPage}
                onActivePreviewSlugChange={onActivePreviewSlugChange}
                onPageTitleChange={onPageTitleChange}
                onPageSlugChange={onPageSlugChange}
                onPageShowInNavChange={onPageShowInNavChange}
                onRemovePage={onRemovePage}
              />
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
              <BuilderStylesSection tokensCss={tokensCss} onTokensCssChange={onTokensCssChange} />
            )}
          </fieldset>
        </>
      )}
    </aside>
  );
};

export default BuilderSidebar;
