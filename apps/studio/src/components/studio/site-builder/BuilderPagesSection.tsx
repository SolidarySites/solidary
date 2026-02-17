import { useEffect, useState, type RefObject } from "react";
import type { BuilderPage } from "./types";
import { getPageSafeSlug } from "./utils";

type BuilderPagesSectionProps = {
  pages: BuilderPage[];
  pageLocksBySlug: Record<
    string,
    {
      holderName: string;
      isSelf: boolean;
    }
  >;
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  onAddPage: () => void;
  onActivePreviewSlugChange: (slug: string) => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
  onPageShowInNavChange: (index: number, checked: boolean) => void;
  onRemovePage: (index: number) => void;
};

const getPageItemKey = (page: BuilderPage, index: number) => page.id ?? `page-${index}`;

const getPageKeyFromActiveSlug = (pages: BuilderPage[], activePreviewSlug: string) => {
  const matchedIndex = pages.findIndex((page, index) => getPageSafeSlug(page, index) === activePreviewSlug);
  if (matchedIndex === -1) return null;
  return getPageItemKey(pages[matchedIndex], matchedIndex);
};

const BuilderPagesSection = ({
  pages,
  pageLocksBySlug,
  activePreviewSlug,
  pageTitleRef,
  onAddPage,
  onActivePreviewSlugChange,
  onPageTitleChange,
  onPageSlugChange,
  onPageShowInNavChange,
  onRemovePage
}: BuilderPagesSectionProps) => {
  const [expandedPageKey, setExpandedPageKey] = useState<string | null>(() =>
    getPageKeyFromActiveSlug(pages, activePreviewSlug)
  );

  useEffect(() => {
    setExpandedPageKey(getPageKeyFromActiveSlug(pages, activePreviewSlug));
  }, [activePreviewSlug, pages]);

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
          const pageKey = getPageItemKey(page, index);
          const isExpanded = expandedPageKey === pageKey;
          const pageLabel = page.title.trim() || (page.isHome ? "Home" : "Untitled page");
          const pageLock = pageLocksBySlug[safeSlug];
          const pageLockedByOther = Boolean(pageLock && !pageLock.isSelf);

          return (
            <div
              key={pageKey}
              className={`builder-page-item ${pageLockedByOther ? "is-locked" : ""}`.trim()}
            >
              <div className="builder-page-row">
                <span className="builder-page-row-label">{pageLabel}</span>
                <button
                  type="button"
                  className={`builder-page-edit-link ${isExpanded ? "is-active" : ""} ${
                    pageLockedByOther ? "is-locked" : ""
                  }`.trim()}
                  onClick={() => {
                    onActivePreviewSlugChange(safeSlug);
                    setExpandedPageKey((current) => (current === pageKey ? null : pageKey));
                  }}
                >
                  {isExpanded ? "Close" : "Edit"}
                </button>
              </div>

              {pageLockedByOther && (
                <p className="builder-page-lock-note">
                  {pageLock?.holderName ?? "Another collaborator"} is editing this page.
                </p>
              )}

              {isExpanded && (
                <div className="builder-page-details">
                  <fieldset className="builder-locked-fieldset" disabled={pageLockedByOther}>
                    <label>
                      Title
                      <input
                        ref={index === pages.length - 1 ? pageTitleRef : null}
                        value={page.title}
                        onChange={(event) => onPageTitleChange(index, event.target.value)}
                        disabled={page.isHome || pageLockedByOther}
                      />
                    </label>
                    <label>
                      Slug
                      <input
                        value={page.slug}
                        onChange={(event) => onPageSlugChange(index, event.target.value)}
                        disabled={page.isHome || pageLockedByOther}
                      />
                    </label>
                    {!page.isHome && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={page.showInNav}
                          onChange={(event) => onPageShowInNavChange(index, event.target.checked)}
                          disabled={pageLockedByOther}
                        />
                        Show in navigation
                      </label>
                    )}
                    {!page.isHome && (
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => onRemovePage(index)}
                        disabled={pageLockedByOther}
                      >
                        Remove page
                      </button>
                    )}
                  </fieldset>
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
