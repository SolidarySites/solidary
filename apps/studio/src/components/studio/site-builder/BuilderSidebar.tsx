import type { RefObject } from "react";
import BuilderContentSection from "./BuilderContentSection";
import BuilderPagesSection from "./BuilderPagesSection";
import BuilderSettingsSection from "./BuilderSettingsSection";
import BuilderStylesSection from "./BuilderStylesSection";
import type { BuilderPage, BuilderSection } from "./types";

type BuilderSidebarProps = {
  activeSection: BuilderSection;
  siteTitle: string;
  siteDescription: string;
  siteImagePreview: string | null;
  pages: BuilderPage[];
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  tokensCss: string;
  siteUrl: string;
  siteLocale: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  onBack: () => void;
  onSectionChange: (section: BuilderSection) => void;
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
  onSiteLocaleChange: (value: string) => void;
  onAuthorNameChange: (value: string) => void;
  onAuthorEmailChange: (value: string) => void;
  onAuthorUrlChange: (value: string) => void;
};

const BuilderSidebar = ({
  activeSection,
  siteTitle,
  siteDescription,
  siteImagePreview,
  pages,
  activePreviewSlug,
  pageTitleRef,
  tokensCss,
  siteUrl,
  siteLocale,
  authorName,
  authorEmail,
  authorUrl,
  onBack,
  onSectionChange,
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
  onSiteLocaleChange,
  onAuthorNameChange,
  onAuthorEmailChange,
  onAuthorUrlChange
}: BuilderSidebarProps) => (
  <aside className="builder-sidebar">
    <button className="ghost" type="button" onClick={onBack}>
      BACK
    </button>

    <div className="builder-sidebar-nav">
      <button
        className={activeSection === "content" ? "primary" : "ghost"}
        onClick={() => onSectionChange("content")}
      >
        Solidary Metadata
      </button>
      <button
        className={activeSection === "pages" ? "primary" : "ghost"}
        onClick={() => onSectionChange("pages")}
      >
        Pages
      </button>
      <button
        className={activeSection === "styles" ? "primary" : "ghost"}
        onClick={() => onSectionChange("styles")}
      >
        Styles
      </button>
      <button
        className={activeSection === "settings" ? "primary" : "ghost"}
        onClick={() => onSectionChange("settings")}
      >
        Settings
      </button>
    </div>

    {activeSection === "content" && (
      <BuilderContentSection
        siteTitle={siteTitle}
        siteDescription={siteDescription}
        siteImagePreview={siteImagePreview}
        onSiteTitleChange={onSiteTitleChange}
        onSiteDescriptionChange={onSiteDescriptionChange}
        onSiteImageChange={onSiteImageChange}
      />
    )}

    {activeSection === "pages" && (
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

    {activeSection === "styles" && (
      <BuilderStylesSection tokensCss={tokensCss} onTokensCssChange={onTokensCssChange} />
    )}

    {activeSection === "settings" && (
      <BuilderSettingsSection
        siteUrl={siteUrl}
        siteLocale={siteLocale}
        authorName={authorName}
        authorEmail={authorEmail}
        authorUrl={authorUrl}
        onSiteUrlChange={onSiteUrlChange}
        onSiteLocaleChange={onSiteLocaleChange}
        onAuthorNameChange={onAuthorNameChange}
        onAuthorEmailChange={onAuthorEmailChange}
        onAuthorUrlChange={onAuthorUrlChange}
      />
    )}
  </aside>
);

export default BuilderSidebar;
