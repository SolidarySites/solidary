import type { RefObject } from "react";
import BuilderContentSection from "./BuilderContentSection";
import BuilderFooterSection from "./BuilderFooterSection";
import BuilderFormatTextSection from "./BuilderFormatTextSection";
import BuilderHeaderSection from "./BuilderHeaderSection";
import BuilderPagesSection from "./BuilderPagesSection";
import BuilderStylesSection from "./BuilderStylesSection";
import type { BuilderPage, BuilderSection, BuilderSettingsSection } from "./types";

type BuilderSidebarProps = {
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
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
  footerCopyrightDisabled: boolean;
  footerCopyrightName: string;
  footerCustomText: string;
  footerCustomLinksInput: string;
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
  onFooterCopyrightDisabledChange: (value: boolean) => void;
  onFooterCopyrightNameChange: (value: string) => void;
  onFooterCustomTextChange: (value: string) => void;
  onFooterCustomLinksInputChange: (value: string) => void;
  canFormatText: boolean;
  onRunFormatCommand: (command: string, value?: string) => void;
  onRunFormatLink: () => void;
};

const BuilderSidebar = ({
  activeSection,
  activeSettingsSection,
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
  footerCopyrightDisabled,
  footerCopyrightName,
  footerCustomText,
  footerCustomLinksInput,
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
  onFooterCopyrightDisabledChange,
  onFooterCopyrightNameChange,
  onFooterCustomTextChange,
  onFooterCustomLinksInputChange,
  canFormatText,
  onRunFormatCommand,
  onRunFormatLink
}: BuilderSidebarProps) => (
  <aside className="builder-sidebar">
    <button className="ghost" type="button" onClick={onBack}>
      BACK
    </button>

    {activeSection === "menu" && (
      <div className="builder-sidebar-nav">
        <button className="ghost" onClick={() => onSectionChange("content")}>
          Solidary Metadata
        </button>
        <button className="ghost" onClick={() => onSectionChange("settings")}>
          Settings
        </button>
        <button className="ghost" onClick={() => onSectionChange("format_text")}>
          Format Text
        </button>
      </div>
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

    {activeSection === "settings" && (
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
            disableCopyright={footerCopyrightDisabled}
            copyrightName={footerCopyrightName}
            customText={footerCustomText}
            customLinksInput={footerCustomLinksInput}
            onDisabledChange={onFooterDisabledChange}
            onFixedChange={onFooterFixedChange}
            onDisableCopyrightChange={onFooterCopyrightDisabledChange}
            onCopyrightNameChange={onFooterCopyrightNameChange}
            onCustomTextChange={onFooterCustomTextChange}
            onCustomLinksInputChange={onFooterCustomLinksInputChange}
          />
        )}

        {activeSettingsSection === "styles" && (
          <BuilderStylesSection tokensCss={tokensCss} onTokensCssChange={onTokensCssChange} />
        )}
      </>
    )}

    {activeSection === "format_text" && (
      <BuilderFormatTextSection
        canFormatText={canFormatText}
        onRunCommand={onRunFormatCommand}
        onRunLink={onRunFormatLink}
      />
    )}
  </aside>
);

export default BuilderSidebar;
