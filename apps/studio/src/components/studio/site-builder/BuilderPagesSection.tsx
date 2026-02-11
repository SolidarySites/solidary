import type { RefObject } from "react";
import type { BuilderPage } from "./types";
import { getPageSafeSlug } from "./utils";

type BuilderPagesSectionProps = {
  pages: BuilderPage[];
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  onAddPage: () => void;
  onActivePreviewSlugChange: (slug: string) => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
  onPageShowInNavChange: (index: number, checked: boolean) => void;
  onRemovePage: (index: number) => void;
};

const BuilderPagesSection = ({
  pages,
  activePreviewSlug,
  pageTitleRef,
  onAddPage,
  onActivePreviewSlugChange,
  onPageTitleChange,
  onPageSlugChange,
  onPageShowInNavChange,
  onRemovePage
}: BuilderPagesSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Pages</h2>
      <p>Add pages and choose which page is active in the builder panel editor.</p>
    </div>
    <button className="primary" type="button" onClick={onAddPage}>
      Add page
    </button>
    <div className="builder-page-list">
      {pages.map((page, index) => {
        const safeSlug = getPageSafeSlug(page, index);
        return (
          <div key={page.id ?? `new-${index}`} className="builder-page-card">
            <button
              type="button"
              className={activePreviewSlug === safeSlug ? "primary" : "ghost"}
              onClick={() => onActivePreviewSlugChange(safeSlug)}
            >
              {activePreviewSlug === safeSlug ? "Editing in panel" : "Edit in panel"}
            </button>
            <label>
              Title
              <input
                ref={index === pages.length - 1 ? pageTitleRef : null}
                value={page.title}
                onChange={(event) => onPageTitleChange(index, event.target.value)}
                disabled={page.isHome}
              />
            </label>
            <label>
              Slug
              <input
                value={page.slug}
                onChange={(event) => onPageSlugChange(index, event.target.value)}
                disabled={page.isHome}
              />
            </label>
            {!page.isHome && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={page.showInNav}
                  onChange={(event) => onPageShowInNavChange(index, event.target.checked)}
                />
                Show in navigation
              </label>
            )}
            {!page.isHome && (
              <button className="ghost" type="button" onClick={() => onRemovePage(index)}>
                Remove page
              </button>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export default BuilderPagesSection;
