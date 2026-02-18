import type { RefObject } from "react";
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
  isPageEditingMode: boolean;
  activePreviewSlug: string;
  pageTitleRef: RefObject<HTMLInputElement | null>;
  onAddPage: () => void;
  onEnterPageEditingMode: (slug: string) => void;
  onExitPageEditingMode: () => void;
  onPageTitleChange: (index: number, value: string) => void;
  onPageSlugChange: (index: number, value: string) => void;
  onPageShowInNavChange: (index: number, checked: boolean) => void;
  onRemovePage: (index: number) => void;
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
  onExitPageEditingMode,
  onPageTitleChange,
  onPageSlugChange,
  onPageShowInNavChange,
  onRemovePage
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

  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>{isPageEditingMode ? "Edit page" : "Pages"}</h2>
        <p>
          {isPageEditingMode
            ? "Edit this page while other collaborators keep working elsewhere."
            : "Choose a page to start editing."}
        </p>
      </div>
      <div className="builder-page-row">
        <button className="primary" type="button" onClick={onAddPage}>
          Add page
        </button>
        {isPageEditingMode && (
          <button className="ghost" type="button" onClick={onExitPageEditingMode}>
            Done editing
          </button>
        )}
      </div>

      {isPageEditingMode && activePage && (
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
            {!activePage.isHome && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={activePage.showInNav}
                  onChange={(event) => onPageShowInNavChange(activePageIndex, event.target.checked)}
                  disabled={activePageLockedByOther}
                />
                Show in navigation
              </label>
            )}
            {!activePage.isHome && (
              <button
                className="ghost"
                type="button"
                onClick={() => onRemovePage(activePageIndex)}
                disabled={activePageLockedByOther}
              >
                Remove page
              </button>
            )}
          </fieldset>
        </div>
      )}

      <div className="builder-page-list">
        {pages.map((page, index) => {
          const safeSlug = getPageSafeSlug(page, index);
          const pageKey = getPageItemKey(page, index);
          const pageLabel = page.title.trim() || (page.isHome ? "Home" : "Untitled page");
          const pageLock = pageLocksBySlug[safeSlug];
          const pageLockedByOther = Boolean(pageLock && !pageLock.isSelf);
          const isActiveEditingPage = isPageEditingMode && safeSlug === activePageSafeSlug;

          return (
            <div
              key={pageKey}
              className={`builder-page-item ${pageLockedByOther ? "is-locked" : ""}`.trim()}
            >
              <div className="builder-page-row">
                <span className="builder-page-row-label">{pageLabel}</span>
                <button
                  type="button"
                  className={`builder-page-edit-link ${
                    isActiveEditingPage ? "is-active" : ""
                  } ${pageLockedByOther ? "is-locked" : ""}`.trim()}
                  onClick={() => onEnterPageEditingMode(safeSlug)}
                  disabled={pageLockedByOther && !isActiveEditingPage}
                >
                  {isActiveEditingPage ? "Editing" : "Edit"}
                </button>
              </div>

              {pageLockedByOther && !isActiveEditingPage && (
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
