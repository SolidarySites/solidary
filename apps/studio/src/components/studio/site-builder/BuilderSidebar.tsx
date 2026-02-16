import type { RefObject } from "react";
import BuilderContentSection from "./BuilderContentSection";
import BuilderEditorToolbar from "./BuilderEditorToolbar";
import BuilderFooterSection from "./BuilderFooterSection";
import BuilderHeaderSection from "./BuilderHeaderSection";
import BuilderImageSettingsPanel from "./BuilderImageSettingsPanel";
import BuilderPagesSection from "./BuilderPagesSection";
import BuilderStylesSection from "./BuilderStylesSection";
import type { PreviewSelectedImage } from "../AstroTemplatePreview";
import type { BuilderPage, BuilderSection, BuilderSettingsSection, FooterModule } from "./types";

type BuilderSidebarProps = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  canEditDraft: boolean;
  canEditMetadata: boolean;
  siteTitle: string;
  siteDescription: string;
  siteImagePreview: string | null;
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
  onBack: () => void;
  onSectionChange: (section: BuilderSection) => void;
  onSettingsSectionChange: (section: BuilderSettingsSection) => void;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteImageChange: (file: File | null) => void;
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
  onBack,
  onSectionChange,
  onSettingsSectionChange,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteImageChange,
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
}: BuilderSidebarProps) => (
  <aside className="builder-sidebar">
    <button className="ghost" type="button" onClick={onBack}>
      BACK
    </button>

    {activeSection === "menu" && (
      <>
        <div className="builder-sidebar-nav">
          {canEditMetadata && (
            <button className="ghost" onClick={() => onSectionChange("content")}>
              Solidary Metadata
            </button>
          )}
          {canEditDraft && (
            <button className="ghost" onClick={() => onSectionChange("settings")}>
              Settings
            </button>
          )}
        </div>
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
                  Formatting tools are available once the preview has loaded.
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
      <BuilderContentSection
        siteTitle={siteTitle}
        siteDescription={siteDescription}
        siteUrl={siteUrl}
        siteImagePreview={siteImagePreview}
        onSiteTitleChange={onSiteTitleChange}
        onSiteDescriptionChange={onSiteDescriptionChange}
        onSiteUrlChange={onSiteUrlChange}
        onSiteImageChange={onSiteImageChange}
      />
    )}

    {activeSection === "settings" && canEditDraft && (
      <>
        <div className="builder-sidebar-nav">
          <button
            className={activeSettingsSection === "pages" ? "primary" : "ghost"}
            onClick={() => onSettingsSectionChange("pages")}
          >
            Pages
          </button>
          <button
            className={activeSettingsSection === "header" ? "primary" : "ghost"}
            onClick={() => onSettingsSectionChange("header")}
          >
            Header
          </button>
          <button
            className={activeSettingsSection === "footer" ? "primary" : "ghost"}
            onClick={() => onSettingsSectionChange("footer")}
          >
            Footer
          </button>
          <button
            className={activeSettingsSection === "styles" ? "primary" : "ghost"}
            onClick={() => onSettingsSectionChange("styles")}
          >
            Styles
          </button>
        </div>

        {activeSettingsSection === "pages" && (
          <BuilderPagesSection
            pages={pages}
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
      </>
    )}
  </aside>
);

export default BuilderSidebar;
