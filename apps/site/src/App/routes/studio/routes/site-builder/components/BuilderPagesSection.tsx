import { javascript as javascriptLanguage } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";
import { useState, type RefObject } from "react";
import type { PreviewSelectedElement } from "./AstroTemplatePreview";
import BuilderImageSettingsPanel from "./BuilderImageSettingsPanel";
import type { BuilderPage } from "../services/types";
import { getPageSafeSlug } from "../services/utils";

type BuilderPageEditView = "settings" | "properties" | "javascript";

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
  onPageJavaScriptChange: (safeSlug: string, value: string) => void;
  canEditPageJavaScript: boolean;
  isEditingDisabled: boolean;
  selectedEditorImage: {
    pageSlug: string;
    src: string;
    alt: string;
    caption: string;
    sizePercent: number;
  } | null;
  selectedEditorElement: PreviewSelectedElement | null;
  onSelectedEditorImageAltChange: (value: string) => void;
  onSelectedEditorImageCaptionChange: (value: string) => void;
  onSelectedEditorImageSizeChange: (value: number) => void;
  onSelectedEditorElementClassNameChange: (value: string) => void;
  onSelectedEditorElementInlineStyleChange: (value: string) => void;
};

const getPageItemKey = (page: BuilderPage, index: number) => page.id ?? `page-${index}`;
const pageJavaScriptEditorExtensions = [javascriptLanguage()];

const BuilderPagesSection = ({
  pages,
  pageLocksBySlug,
  isPageEditingMode,
  activePreviewSlug,
  pageTitleRef,
  onAddPage,
  onEnterPageEditingMode,
  onPageTitleChange,
  onPageSlugChange,
  onPageJavaScriptChange,
  canEditPageJavaScript,
  isEditingDisabled,
  selectedEditorImage,
  selectedEditorElement,
  onSelectedEditorImageAltChange,
  onSelectedEditorImageCaptionChange,
  onSelectedEditorImageSizeChange,
  onSelectedEditorElementClassNameChange,
  onSelectedEditorElementInlineStyleChange
}: BuilderPagesSectionProps) => {
  const [activeEditView, setActiveEditView] = useState<BuilderPageEditView>("properties");
  const activePageIndex = pages.findIndex(
    (page, index) => getPageSafeSlug(page, index) === activePreviewSlug
  );
  const activePage = activePageIndex >= 0 ? pages[activePageIndex] : null;
  const activePageSafeSlug = activePage
    ? getPageSafeSlug(activePage, activePageIndex)
    : activePreviewSlug;
  const activePageLock = pageLocksBySlug[activePageSafeSlug];
  const activePageLockedByOther = Boolean(activePageLock && !activePageLock.isSelf);
  const canEditCurrentPageJavaScript =
    !activePageLockedByOther && !isEditingDisabled && canEditPageJavaScript;
  const selectedElementForActivePage =
    selectedEditorElement && selectedEditorElement.pageSlug === activePageSafeSlug
      ? selectedEditorElement
      : null;
  const selectedImageForActivePage =
    selectedEditorImage && selectedEditorImage.pageSlug === activePageSafeSlug
      ? selectedEditorImage
      : null;

  if (isPageEditingMode) {
    return (
      <div className="builder-section">
        <div className="builder-page-editor-mode-row" role="radiogroup" aria-label="Edit page section">
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button ${
              activeEditView === "properties" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActiveEditView("properties")}
            aria-pressed={activeEditView === "properties"}
          >
            Properties
          </button>
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button ${
              activeEditView === "settings" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActiveEditView("settings")}
            aria-pressed={activeEditView === "settings"}
          >
            Settings
          </button>
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button ${
              activeEditView === "javascript" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActiveEditView("javascript")}
            aria-pressed={activeEditView === "javascript"}
          >
            JavaScript
          </button>
        </div>

        {activeEditView !== "properties" && (
          <div className="section-header">
            <h2>Edit page</h2>
            <p>Edit this page while other collaborators keep working elsewhere.</p>
          </div>
        )}

        {activePage ? (
          <div className={`builder-page-details ${activePageLockedByOther ? "is-locked" : ""}`.trim()}>
            {activePageLockedByOther && (
              <p className="builder-page-lock-note">
                {activePageLock?.holderName ?? "Another collaborator"} is editing this page.
              </p>
            )}
            <fieldset className="builder-locked-fieldset" disabled={activePageLockedByOther}>
              {activeEditView === "settings" && (
                <>
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
                </>
              )}

              {activeEditView === "properties" && (
                <div className="builder-page-properties-panel">
                  {selectedElementForActivePage ? (
                    <div className="builder-page-properties-card">
                      <p className="builder-page-properties-tag">
                        Selected: <code>{`<${selectedElementForActivePage.tagName}>`}</code>
                      </p>
                      <label>
                        Custom class
                        <input
                          value={selectedElementForActivePage.className}
                          onChange={(event) =>
                            onSelectedEditorElementClassNameChange(event.target.value)
                          }
                          placeholder="example-class another-class"
                        />
                      </label>
                      <label>
                        Inline style
                        <input
                          value={selectedElementForActivePage.inlineStyle}
                          onChange={(event) =>
                            onSelectedEditorElementInlineStyleChange(event.target.value)
                          }
                          placeholder="color: #222; margin-top: 1rem;"
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="builder-image-settings-empty">
                      Place the cursor in the preview content to inspect and edit element properties.
                    </p>
                  )}

                  {selectedImageForActivePage && (
                    <BuilderImageSettingsPanel
                      image={selectedImageForActivePage}
                      onAltChange={onSelectedEditorImageAltChange}
                      onCaptionChange={onSelectedEditorImageCaptionChange}
                      onSizeChange={onSelectedEditorImageSizeChange}
                      showHeading={false}
                      showEmptyState={false}
                    />
                  )}
                </div>
              )}

              {activeEditView === "javascript" && (
                <>
                  <label>
                    JavaScript
                    <CodeMirror
                      className="builder-page-javascript-editor"
                      value={activePage.javascript ?? ""}
                      extensions={pageJavaScriptEditorExtensions}
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: true,
                        highlightActiveLine: true,
                        autocompletion: true
                      }}
                      onChange={(value) => {
                        if (!canEditCurrentPageJavaScript) return;
                        onPageJavaScriptChange(activePageSafeSlug, value);
                      }}
                      editable={canEditCurrentPageJavaScript}
                      height="280px"
                      aria-label="Page JavaScript"
                    />
                  </label>
                  {!canEditPageJavaScript && (
                    <p className="builder-page-lock-note">Only owner/admin roles can edit JavaScript.</p>
                  )}
                </>
              )}
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
