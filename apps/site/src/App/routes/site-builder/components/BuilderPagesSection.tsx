import type { RefObject } from "react";
import type { BuilderPage } from "../services/types";
import { getPageSafeSlug } from "../services/utils";

type BuilderPagesSectionProps = {
  pages: BuilderPage[];
  pageLocksBySlug: Record<
    string,
    {
      holderName: string;
      isSelf: boolean;
    }
  >;
  isPageEditingMode: boolean;
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  onAddPage: () => void;
  onEnterPageEditingMode: (slug: string) => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
};

const getPageItemKey = (page: BuilderPage, index: number) => page.id ?? `page-${index}`;

const BuilderPagesSection = ({
  pages,
  pageLocksBySlug,
  isPageEditingMode,
  activePreviewSlug,
  pageTitleRef,
  onAddPage,
  onEnterPageEditingMode,
  onPageTitleChange,
  onPageSlugChange
}: BuilderPagesSectionProps) => {
  const activePageIndex = pages.findIndex(
    (page, index) => getPageSafeSlug(page, index) === activePreviewSlug
  );
  const activePage = activePageIndex >= 0 ? pages[activePageIndex] : null;
  const activePageSafeSlug = activePage
    ? getPageSafeSlug(activePage, activePageIndex)
    : activePreviewSlug;
  const activePageLock = pageLocksBySlug[activePageSafeSlug];
  const activePageLockedByOther = Boolean(activePageLock && !activePageLock.isSelf);

  if (isPageEditingMode) {
    return (
      <div className="builder-section">
        <div className="section-header">
          <h2>Edit page</h2>
          <p>Edit this page while other collaborators keep working elsewhere.</p>
        </div>

        {activePage ? (
          <div className={`builder-page-details ${activePageLockedByOther ? "is-locked" : ""}`.trim()}>
            {activePageLockedByOther && (
              <p className="builder-page-lock-note">
                {activePageLock?.holderName ?? "Another collaborator"} is editing this page.
              </p>
            )}
            <fieldset className="builder-locked-fieldset" disabled={activePageLockedByOther}>
              <label>
                Title
                <input
                  ref={pageTitleRef}
                  value={activePage.title}
                  onChange={(event) => onPageTitleChange(activePageIndex, event.target.value)}
                  disabled={activePage.isHome || activePageLockedByOther}
                />
              </label>
              <label>
                Slug
                <input
                  value={activePage.slug}
                  onChange={(event) => onPageSlugChange(activePageIndex, event.target.value)}
                  disabled={activePage.isHome || activePageLockedByOther}
                />
              </label>
            </fieldset>
          </div>
        ) : (
          <p className="builder-page-lock-note">Selected page is no longer available.</p>
        )}
      </div>
    );
  }

  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>Pages</h2>
        <p>Choose a page to start editing.</p>
      </div>
      <button className="primary" type="button" onClick={onAddPage}>
        Add page
      </button>
      <div className="builder-page-list">
        {pages.map((page, index) => {
          const safeSlug = getPageSafeSlug(page, index);
          const pageKey = getPageItemKey(page, index);
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
                  className={`builder-page-edit-link ${pageLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onEnterPageEditingMode(safeSlug)}
                  disabled={pageLockedByOther}
                >
                  Edit
                </button>
              </div>

              {pageLockedByOther && (
                <p className="builder-page-lock-note">
                  {pageLock?.holderName ?? "Another collaborator"} is editing this page.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BuilderPagesSection;
