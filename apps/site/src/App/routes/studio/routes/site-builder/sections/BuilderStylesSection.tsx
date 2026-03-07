import { css as cssLanguage } from "@codemirror/lang-css";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useState } from "react";
import {
  buildPrimaryFontStack,
  buildSecondaryFontStack,
  extractCustomCssFromTokens,
  extractLeadingFontName,
  formatRgbaFromHex,
  getCssVariableValue,
  parseCssColor,
  removeCssVariable,
  setCssVariableValue,
  setCustomCssInTokens
} from "../services/style-editor";
import type { BuilderStylesMode } from "../services/types";

type BuilderStylesSectionProps = {
  styleMode: BuilderStylesMode;
  tokensCss: string;
  advancedStructureCss: string;
  availableFonts: string[];
  fontsLoading: boolean;
  fontsError: string | null;
  mobilePreviewEnabled: boolean;
  onTokensCssChange: (value: string) => void;
  onStyleModeChange: (value: BuilderStylesMode) => void;
  onAdvancedStructureCssChange: (value: string) => void;
  onMobilePreviewEnabledChange: (value: boolean) => void;
};

type TokenField = {
  variable: string;
  label: string;
  description: string;
  fallback?: string;
};

type LayoutTokenField = TokenField & {
  mobileVariable: string;
};

const colorFields: TokenField[] = [
  { variable: "--bg", label: "Background color", description: "Main page background color.", fallback: "#fbfbf9" },
  {
    variable: "--header-bg",
    label: "Header color",
    description: "Background behind the site header and navigation.",
    fallback: "#fbfbf9"
  },
  {
    variable: "--footer-bg",
    label: "Footer color",
    description: "Background behind the site footer content.",
    fallback: "#fbfbf9"
  },
  { variable: "--fg", label: "Text color", description: "Primary text color used across content." },
  { variable: "--muted", label: "Muted text color", description: "Secondary text color for helper text." },
  { variable: "--link", label: "Link color", description: "Link and interactive text color." }
];

type LayoutFieldGroup = {
  title: string;
  description: string;
  fields: LayoutTokenField[];
};

const layoutFieldGroups: LayoutFieldGroup[] = [
  {
    title: "Page",
    description: "These values affect the main content column and article spacing.",
    fields: [
      {
        variable: "--maxw",
        mobileVariable: "--mobile-maxw",
        label: "Content max width",
        description: "Maximum width of the main content area.",
        fallback: "900px"
      },
      {
        variable: "--page-padding-y",
        mobileVariable: "--mobile-page-padding-y",
        label: "Page top and bottom padding",
        description: "Space above and below the main content area.",
        fallback: "32px"
      },
      {
        variable: "--page-padding-x",
        mobileVariable: "--mobile-page-padding-x",
        label: "Page side padding",
        description: "Space between the content and the left or right edge of the viewport.",
        fallback: "24px"
      },
      {
        variable: "--content-block-gap",
        mobileVariable: "--mobile-content-block-gap",
        label: "Paragraph and list spacing",
        description: "Vertical space between paragraphs, lists, and other stacked content blocks.",
        fallback: "16px"
      },
      {
        variable: "--compact-gap",
        mobileVariable: "--mobile-compact-gap",
        label: "Compact element spacing",
        description: "Tighter spacing used for code blocks and the smaller spacing below headings.",
        fallback: "12px"
      },
      {
        variable: "--section-gap",
        mobileVariable: "--mobile-section-gap",
        label: "Section heading spacing",
        description: "Extra space before major section headings inside the page content.",
        fallback: "32px"
      }
    ]
  },
  {
    title: "Header",
    description: "These values affect the header padding and spacing between the brand and nav.",
    fields: [
      {
        variable: "--header-padding-y",
        mobileVariable: "--mobile-header-padding-y",
        label: "Header top and bottom padding",
        description: "Space above and below the header content.",
        fallback: "16px"
      },
      {
        variable: "--header-padding-x",
        mobileVariable: "--mobile-header-padding-x",
        label: "Header side padding",
        description: "Space between the header content and the left or right edge of the viewport.",
        fallback: "24px"
      },
      {
        variable: "--header-gap",
        mobileVariable: "--mobile-header-gap",
        label: "Header item gap",
        description: "Space between the brand area and navigation items.",
        fallback: "16px"
      }
    ]
  },
  {
    title: "Footer",
    description: "These values affect the footer padding and spacing between footer modules.",
    fields: [
      {
        variable: "--footer-padding-y",
        mobileVariable: "--mobile-footer-padding-y",
        label: "Footer top and bottom padding",
        description: "Space above and below the footer content.",
        fallback: "24px"
      },
      {
        variable: "--footer-padding-x",
        mobileVariable: "--mobile-footer-padding-x",
        label: "Footer side padding",
        description: "Space between the footer content and the left or right edge of the viewport.",
        fallback: "24px"
      },
      {
        variable: "--footer-gap",
        mobileVariable: "--mobile-footer-gap",
        label: "Footer module gap",
        description: "Space between the footer columns or stacked footer sections.",
        fallback: "16px"
      }
    ]
  }
];

const MOBILE_MENU_BACKGROUND_VARIABLE = "--mobile-menu-bg";
const MOBILE_MENU_WIDTH_VARIABLE = "--mobile-menu-width";
const MOBILE_MENU_TEXT_ALIGN_VARIABLE = "--mobile-menu-text-align";

const MOBILE_MENU_TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
] as const;

const customCssEditorExtensions = [cssLanguage(), EditorView.lineWrapping];
const styleEditorBasicSetup = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  autocompletion: true
};
type BuilderStylesPanel = "colors" | "typography" | "layout" | "customCss";

const RgbaColorControls = ({
  value,
  onChange,
  defaultAlpha = 1
}: {
  value: string;
  onChange: (next: string) => void;
  defaultAlpha?: number;
}) => {
  const parsed = parseCssColor(value) ?? { hex: "#000000", alpha: defaultAlpha };
  return (
    <div className="builder-styles-color-row">
      <div className="builder-styles-color-top-row">
        <label className="builder-styles-color-picker">
          Color
          <input
            type="color"
            value={parsed.hex}
            onChange={(event) => onChange(formatRgbaFromHex(event.target.value, parsed.alpha))}
          />
        </label>
        <label className="builder-styles-alpha-value">
          Alpha
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={parsed.alpha}
            onChange={(event) =>
              onChange(formatRgbaFromHex(parsed.hex, Number.parseFloat(event.target.value || "0")))
            }
          />
        </label>
      </div>
      <label className="builder-styles-color-value">
        Value
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  );
};

const BuilderStylesSection = ({
  styleMode,
  tokensCss,
  advancedStructureCss,
  availableFonts,
  fontsLoading,
  fontsError,
  mobilePreviewEnabled,
  onTokensCssChange,
  onStyleModeChange,
  onAdvancedStructureCssChange,
  onMobilePreviewEnabledChange
}: BuilderStylesSectionProps) => {
  const [activePanel, setActivePanel] = useState<BuilderStylesPanel>(
    styleMode === "advanced" ? "customCss" : "colors"
  );

  const updateToken = (variable: string, value: string) =>
    onTokensCssChange(setCssVariableValue(tokensCss, variable, value));
  const removeToken = (variable: string) => onTokensCssChange(removeCssVariable(tokensCss, variable));
  const readToken = (variable: string, fallback = "") => getCssVariableValue(tokensCss, variable, fallback);
  const toggleMobileOverride = (field: LayoutTokenField, enabled: boolean) => {
    if (enabled) {
      updateToken(field.mobileVariable, readToken(field.variable, field.fallback ?? ""));
      return;
    }
    removeToken(field.mobileVariable);
  };

  const primaryFontStack = readToken("--font-sans", "");
  const secondaryFontStack = readToken("--font-mono", "");
  const primarySelectedFont = extractLeadingFontName(primaryFontStack);
  const secondarySelectedFont = extractLeadingFontName(secondaryFontStack);
  const customCss = extractCustomCssFromTokens(tokensCss);
  const hasAvailableFonts = availableFonts.length > 0;
  const selectedPrimaryFont = hasAvailableFonts && availableFonts.includes(primarySelectedFont)
    ? primarySelectedFont
    : "";
  const selectedSecondaryFont = hasAvailableFonts && availableFonts.includes(secondarySelectedFont)
    ? secondarySelectedFont
    : "";
  const borderValue = readToken("--border", "rgba(0, 0, 0, 0.12)");
  const mobileMenuBackgroundValue = readToken(
    MOBILE_MENU_BACKGROUND_VARIABLE,
    readToken("--header-bg", readToken("--bg", "#fbfbf9"))
  );
  const mobileMenuWidthValue = readToken(MOBILE_MENU_WIDTH_VARIABLE, "fit-content");
  const mobileMenuTextAlignValue = (() => {
    const value = readToken(MOBILE_MENU_TEXT_ALIGN_VARIABLE, "right");
    return value === "left" || value === "center" || value === "right" ? value : "right";
  })();
  const isAdvancedMode = styleMode === "advanced";
  const visiblePanel: BuilderStylesPanel = isAdvancedMode ? "customCss" : activePanel;

  return (
    <div className="builder-section builder-styles-section">
      {!isAdvancedMode && (
        <div className="builder-styles-section-row" role="radiogroup" aria-label="Styles section">
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button builder-styles-section-button ${
              visiblePanel === "colors" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActivePanel("colors")}
            aria-pressed={visiblePanel === "colors"}
          >
            Color
          </button>
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button builder-styles-section-button ${
              visiblePanel === "typography" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActivePanel("typography")}
            aria-pressed={visiblePanel === "typography"}
          >
            Type
          </button>
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button builder-styles-section-button ${
              visiblePanel === "layout" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActivePanel("layout")}
            aria-pressed={visiblePanel === "layout"}
          >
            Layout
          </button>
          <button
            type="button"
            className={`ghost builder-page-editor-mode-button builder-styles-section-button ${
              visiblePanel === "customCss" ? "is-active" : ""
            }`.trim()}
            onClick={() => setActivePanel("customCss")}
            aria-pressed={visiblePanel === "customCss"}
          >
            CSS
          </button>
        </div>
      )}

      {isAdvancedMode && (
        <div className="builder-styles-card">
          <CodeMirror
            className="builder-styles-custom-css-editor builder-advanced-css-block"
            value={advancedStructureCss}
            extensions={customCssEditorExtensions}
            basicSetup={styleEditorBasicSetup}
            onChange={onAdvancedStructureCssChange}
            height="340px"
            aria-label="Advanced structure.css"
          />
          <div className="builder-styles-advanced-toggle-shell is-enabled">
            <label className="builder-styles-advanced-toggle">
              <input
                type="checkbox"
                checked
                onChange={(event) => onStyleModeChange(event.target.checked ? "advanced" : "simple")}
              />
              <span>Enable advanced mode</span>
            </label>
            <p className="builder-styles-advanced-warning">
              Advanced mode is enabled. Disable this to restore color, typography, layout, and custom CSS
              controls.
            </p>
          </div>
        </div>
      )}

      {visiblePanel === "colors" && (
        <div className="builder-styles-card">
          <div className="section-header">
            <h3>Colors</h3>
            <p>Adjust key color tokens used across the site.</p>
          </div>
          <div className="builder-styles-fields">
            {colorFields.map((field) => {
              const value = getCssVariableValue(tokensCss, field.variable, field.fallback ?? "");
              return (
                <div key={field.variable} className="builder-styles-field">
                  <label>
                    {field.label}
                    <p className="builder-format-toolbar-note">{field.description}</p>
                    <RgbaColorControls value={value} onChange={(next) => updateToken(field.variable, next)} />
                  </label>
                </div>
              );
            })}
            <div className="builder-styles-field">
              <label>
                Border color
                <p className="builder-format-toolbar-note">
                  Border and divider color with transparency support.
                </p>
                <RgbaColorControls
                  value={borderValue}
                  defaultAlpha={0.12}
                  onChange={(value) => updateToken("--border", value)}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {visiblePanel === "typography" && (
        <>
          <div className="builder-styles-font-status">
            <p className="builder-format-toolbar-note">
              {fontsLoading
                ? "Loading fonts from src/styles/partials/fonts.css..."
                : "Font options are loaded from src/styles/partials/fonts.css."}
            </p>
          </div>
          {fontsError && <p className="builder-section-lock-note">{fontsError}</p>}
          <div className="builder-styles-card">
            <div className="section-header">
              <h3>Typography</h3>
              <p>Choose uploaded fonts or type a custom font family name. Fallback stacks are applied automatically.</p>
            </div>
            <div className="builder-styles-fields">
              <label>
                Primary font family
                <p className="builder-format-toolbar-note">
                  Used for body and content text. Type the exact <code>font-family</code> name if you are
                  loading it from Google Fonts or custom head HTML.
                </p>
                <input
                  value={primarySelectedFont}
                  placeholder="e.g. Instrument Serif"
                  onChange={(event) => updateToken("--font-sans", buildPrimaryFontStack(event.target.value))}
                />
              </label>
              <label>
                Primary font from uploaded assets
                <p className="builder-format-toolbar-note">
                  Quick-pick a font found in <code>src/styles/partials/fonts.css</code>.
                </p>
                <select
                  value={selectedPrimaryFont}
                  disabled={!hasAvailableFonts}
                  onChange={(event) => updateToken("--font-sans", buildPrimaryFontStack(event.target.value))}
                >
                  <option value="">
                    {hasAvailableFonts ? "Choose an uploaded font" : "No uploaded fonts available"}
                  </option>
                  {availableFonts.map((fontName, index) => (
                    <option key={`primary-${fontName}-${index}`} value={fontName}>
                      {fontName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Secondary font family
                <p className="builder-format-toolbar-note">
                  Used for monospace or secondary text roles. Type a custom family name if needed.
                </p>
                <input
                  value={secondarySelectedFont}
                  placeholder="e.g. IBM Plex Mono"
                  onChange={(event) => updateToken("--font-mono", buildSecondaryFontStack(event.target.value))}
                />
              </label>
              <label>
                Secondary font from uploaded assets
                <p className="builder-format-toolbar-note">
                  Quick-pick a font found in <code>src/styles/partials/fonts.css</code>.
                </p>
                <select
                  value={selectedSecondaryFont}
                  disabled={!hasAvailableFonts}
                  onChange={(event) => updateToken("--font-mono", buildSecondaryFontStack(event.target.value))}
                >
                  <option value="">
                    {hasAvailableFonts ? "Choose an uploaded font" : "No uploaded fonts available"}
                  </option>
                  {availableFonts.map((fontName, index) => (
                    <option key={`secondary-${fontName}-${index}`} value={fontName}>
                      {fontName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </>
      )}

      {visiblePanel === "layout" && (
        <div className="builder-styles-card">
          <div className="section-header">
            <h3>Layout & spacing</h3>
            <p>
              Tune the main content spacing, plus separate header and footer spacing.
              {mobilePreviewEnabled
                ? " Mobile-only overrides are enabled below because the preview is in mobile mode."
                : ""}
            </p>
          </div>
          {layoutFieldGroups.map((group) => (
            <div key={group.title} className="builder-styles-group">
              <div className="builder-styles-group-header">
                <h4>{group.title}</h4>
                <p className="builder-format-toolbar-note">{group.description}</p>
              </div>
              <div className="builder-styles-fields">
                {group.fields.map((field) => {
                  const desktopValue = readToken(field.variable, field.fallback ?? "");
                  const hasMobileOverride = readToken(field.mobileVariable, "") !== "";
                  const mobileValue = readToken(field.mobileVariable, desktopValue);

                  return (
                    <div key={field.variable} className="builder-styles-field">
                      <label>
                        {field.label}
                        <p className="builder-format-toolbar-note">{field.description}</p>
                        <input
                          value={desktopValue}
                          onChange={(event) => updateToken(field.variable, event.target.value)}
                        />
                      </label>

                      {mobilePreviewEnabled && (
                        <div className="builder-styles-mobile-override">
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={hasMobileOverride}
                              onChange={(event) => toggleMobileOverride(field, event.target.checked)}
                            />
                            <span>Use a different value on mobile</span>
                          </label>

                          {hasMobileOverride && (
                            <label>
                              Mobile value
                              <p className="builder-format-toolbar-note">
                                Applied only below the mobile navigation breakpoint.
                              </p>
                              <input
                                value={mobileValue}
                                onChange={(event) => updateToken(field.mobileVariable, event.target.value)}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {mobilePreviewEnabled && (
            <div className="builder-styles-group">
              <div className="builder-styles-group-header">
                <h4>Mobile Menu</h4>
                <p className="builder-format-toolbar-note">
                  These values style the fold-out burger menu on mobile only.
                </p>
              </div>
              <div className="builder-styles-fields">
                <div className="builder-styles-field">
                  <label>
                    Mobile menu background color
                    <p className="builder-format-toolbar-note">
                      Background behind the fold-out mobile navigation panel.
                    </p>
                    <RgbaColorControls
                      value={mobileMenuBackgroundValue}
                      onChange={(value) => updateToken(MOBILE_MENU_BACKGROUND_VARIABLE, value)}
                    />
                  </label>
                </div>

                <label>
                  Mobile menu width
                  <p className="builder-format-toolbar-note">
                    Width of the fold-out menu panel. Default is <code>fit-content</code> so it fits the text.
                  </p>
                  <input
                    value={mobileMenuWidthValue}
                    onChange={(event) => updateToken(MOBILE_MENU_WIDTH_VARIABLE, event.target.value)}
                  />
                </label>

                <label>
                  Mobile menu text alignment
                  <p className="builder-format-toolbar-note">
                    Horizontal alignment for items inside the fold-out menu.
                  </p>
                  <select
                    value={mobileMenuTextAlignValue}
                    onChange={(event) => updateToken(MOBILE_MENU_TEXT_ALIGN_VARIABLE, event.target.value)}
                  >
                    {MOBILE_MENU_TEXT_ALIGN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
          <div className="builder-styles-preview-toggle-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={mobilePreviewEnabled}
                onChange={(event) => onMobilePreviewEnabledChange(event.target.checked)}
              />
              <span>Preview in mobile frame</span>
            </label>
            <p className="builder-format-toolbar-note">
              Preview-only. Shrinks the iframe into a phone-sized frame without saving anything to the
              draft. When enabled, mobile-only layout overrides appear above.
            </p>
          </div>
        </div>
      )}

      {!isAdvancedMode && visiblePanel === "customCss" && (
        <div className="builder-styles-card">
          <div className="section-header">
            <h3>Custom CSS</h3>
            <p>Add extra CSS appended inside <code>tokens.css</code> after the default variable block.</p>
          </div>
          <CodeMirror
            className="builder-styles-custom-css-editor"
            value={customCss}
            extensions={customCssEditorExtensions}
            basicSetup={styleEditorBasicSetup}
            onChange={(value) => onTokensCssChange(setCustomCssInTokens(tokensCss, value))}
            height="220px"
            aria-label="Custom CSS"
          />
          <div
            className={`builder-styles-advanced-toggle-shell ${isAdvancedMode ? "is-enabled" : ""}`.trim()}
          >
            <label className="builder-styles-advanced-toggle">
              <input
                type="checkbox"
                checked={isAdvancedMode}
                onChange={(event) => onStyleModeChange(event.target.checked ? "advanced" : "simple")}
              />
              <span>Enable advanced mode</span>
            </label>
            <p className="builder-styles-advanced-warning">
              Warning: Advanced mode requires you to edit all styles for the page and is intended for
              advanced users.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuilderStylesSection;
