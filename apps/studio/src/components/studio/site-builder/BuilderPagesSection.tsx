import { useEffect, useState, type RefObject } from "react";
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
}: BuilderPagesSectionProps) => {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(activePreviewSlug);

  useEffect(() => {
    setExpandedSlug(activePreviewSlug);
  }, [activePreviewSlug]);

  return (
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
          const isExpanded = expandedSlug === safeSlug;
          const pageLabel = page.title.trim() || (page.isHome ? "Home" : "Untitled page");

          return (
            <div key={page.id ?? `new-${index}`} className="builder-page-item">
              <div className="builder-page-row">
                <span className="builder-page-row-label">{pageLabel}</span>
                <button
                  type="button"
                  className={`builder-page-edit-link ${isExpanded ? "is-active" : ""}`}
                  onClick={() => {
                    onActivePreviewSlugChange(safeSlug);
                    setExpandedSlug((current) => (current === safeSlug ? null : safeSlug));
                  }}
                >
                  {isExpanded ? "Close" : "Edit"}
                </button>
              </div>

              {isExpanded && (
                <div className="builder-page-details">
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BuilderPagesSection;
