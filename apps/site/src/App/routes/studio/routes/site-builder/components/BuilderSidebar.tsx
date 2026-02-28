import type { RefObject } from "react";
import BuilderFooterSection from "./BuilderFooterSection";
import BuilderHeaderSection from "./BuilderHeaderSection";
import BuilderImageSettingsPanel from "./BuilderImageSettingsPanel";
import LockAvatarPill from "./LockAvatarPill";
import BuilderPagesSection from "./BuilderPagesSection";
import BuilderStylesSection from "./BuilderStylesSection";
import type { PreviewSelectedImage } from "./AstroTemplatePreview";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  FooterModule
} from "../services/types";

type BuilderSectionLock = {
  holderName: string;
  holderAvatarUrl: string | null;
  isSelf: boolean;
};

type BuilderSidebarProps = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  canEditDraft: boolean;
  pages: BuilderPage[];
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  tokensCss: string;
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
  onSettingsSectionChange: (section: BuilderSettingsSection) => void;
  onAddPage: () => void;
  onEnterPageEditingMode: (slug: string) => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
  onTokensCssChange: (value: string) => void;
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
  onSelectedEditorImageAltChange: (value: string) => void;
  onSelectedEditorImageCaptionChange: (value: string) => void;
  onSelectedEditorImageSizeChange: (value: number) => void;
};

const BuilderSidebar = ({
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  canEditDraft,
  pages,
  activePreviewSlug,
  pageTitleRef,
  tokensCss,
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
  onSettingsSectionChange,
  onAddPage,
  onEnterPageEditingMode,
  onPageTitleChange,
  onPageSlugChange,
  onTokensCssChange,
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
  onSelectedEditorImageAltChange,
  onSelectedEditorImageCaptionChange,
  onSelectedEditorImageSizeChange
}: BuilderSidebarProps) => {
  const headerLock = sectionLocks.header;
  const headerLockedByOther = Boolean(headerLock && !headerLock.isSelf);
  const footerLock = sectionLocks.footer;
  const footerLockedByOther = Boolean(footerLock && !footerLock.isSelf);
  const stylesLock = sectionLocks.styles;
  const stylesLockedByOther = Boolean(stylesLock && !stylesLock.isSelf);
  const pagesLock = sectionLocks.pages;
  const pagesLockedByOther = Boolean(pagesLock && !pagesLock.isSelf);
  const activeSettingsLock = sectionLocks[activeSettingsSection];
  const activeSettingsLockedByOther = Boolean(activeSettingsLock && !activeSettingsLock.isSelf);
  const inPageEditingMode =
    activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode;

  return (
    <aside className="builder-sidebar">
      <button className="ghost" type="button" onClick={onBack}>
        BACK
      </button>

      {canEditDraft && !inPageEditingMode && (
        <div className="builder-sidebar-nav">
          <div className="builder-sidebar-nav-item">
            <button
              className={`${
                activeSection === "settings" && activeSettingsSection === "pages" ? "primary" : "ghost"
              } ${pagesLockedByOther ? "is-locked" : ""}`.trim()}
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
              className={`${
                activeSection === "settings" && activeSettingsSection === "header" ? "primary" : "ghost"
              } ${headerLockedByOther ? "is-locked" : ""}`.trim()}
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
              className={`${
                activeSection === "settings" && activeSettingsSection === "footer" ? "primary" : "ghost"
              } ${footerLockedByOther ? "is-locked" : ""}`.trim()}
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
              className={`${
                activeSection === "settings" && activeSettingsSection === "styles" ? "primary" : "ghost"
              } ${stylesLockedByOther ? "is-locked" : ""}`.trim()}
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
                />
                {isPageEditingMode && (
                  <BuilderImageSettingsPanel
                    image={selectedEditorImage}
                    onAltChange={onSelectedEditorImageAltChange}
                    onCaptionChange={onSelectedEditorImageCaptionChange}
                    onSizeChange={onSelectedEditorImageSizeChange}
                  />
                )}
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
              <BuilderStylesSection tokensCss={tokensCss} onTokensCssChange={onTokensCssChange} />
            )}
          </fieldset>
        </>
      )}
    </aside>
  );
};

export default BuilderSidebar;
