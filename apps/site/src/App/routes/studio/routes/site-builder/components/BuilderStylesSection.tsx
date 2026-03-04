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
  onTokensCssChange: (value: string) => void;
  onStyleModeChange: (value: BuilderStylesMode) => void;
  onAdvancedStructureCssChange: (value: string) => void;
};

type TokenField = {
  variable: string;
  label: string;
  description: string;
};

const colorFields: TokenField[] = [
  { variable: "--bg", label: "Background color", description: "Main page background color." },
  { variable: "--fg", label: "Text color", description: "Primary text color used across content." },
  { variable: "--muted", label: "Muted text color", description: "Secondary text color for helper text." },
  { variable: "--link", label: "Link color", description: "Link and interactive text color." }
];

const spacingFields: TokenField[] = [
  { variable: "--maxw", label: "Content max width", description: "Maximum width of the main content area." },
  { variable: "--space-1", label: "Spacing XS", description: "Small spacing token." },
  { variable: "--space-2", label: "Spacing SM", description: "Small-medium spacing token." },
  { variable: "--space-3", label: "Spacing MD", description: "Medium spacing token." },
  { variable: "--space-4", label: "Spacing LG", description: "Large spacing token." },
  { variable: "--space-5", label: "Spacing XL", description: "Extra-large spacing token." }
];

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
  onTokensCssChange,
  onStyleModeChange,
  onAdvancedStructureCssChange
}: BuilderStylesSectionProps) => {
  const [activePanel, setActivePanel] = useState<BuilderStylesPanel>(
    styleMode === "advanced" ? "customCss" : "colors"
  );

  const updateToken = (variable: string, value: string) =>
    onTokensCssChange(setCssVariableValue(tokensCss, variable, value));

  const primaryFontStack = getCssVariableValue(tokensCss, "--font-sans", "");
  const secondaryFontStack = getCssVariableValue(tokensCss, "--font-mono", "");
  const primarySelectedFont = extractLeadingFontName(primaryFontStack);
  const secondarySelectedFont = extractLeadingFontName(secondaryFontStack);
  const customCss = extractCustomCssFromTokens(tokensCss);
  const hasAvailableFonts = availableFonts.length > 0;
  const selectedPrimaryFallback = hasAvailableFonts ? availableFonts[0] : "";
  const selectedSecondaryFallback = hasAvailableFonts ? availableFonts[0] : "";
  const selectedPrimaryFont = hasAvailableFonts
    ? availableFonts.includes(primarySelectedFont)
      ? primarySelectedFont
      : selectedPrimaryFallback
    : "";
  const selectedSecondaryFont = hasAvailableFonts
    ? availableFonts.includes(secondarySelectedFont)
      ? secondarySelectedFont
      : selectedSecondaryFallback
    : "";
  const borderValue = getCssVariableValue(tokensCss, "--border", "rgba(0, 0, 0, 0.12)");
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
              const value = getCssVariableValue(tokensCss, field.variable, "");
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
              <p>Choose primary and secondary fonts. Fallback stacks are applied automatically.</p>
            </div>
            <div className="builder-styles-fields">
              <label>
                Primary font
                <p className="builder-format-toolbar-note">Used for body and content text.</p>
                <select
                  value={selectedPrimaryFont}
                  disabled={!hasAvailableFonts}
                  onChange={(event) => updateToken("--font-sans", buildPrimaryFontStack(event.target.value))}
                >
                  {!hasAvailableFonts && <option value="">No fonts available</option>}
                  {availableFonts.map((fontName, index) => (
                    <option key={`primary-${fontName}-${index}`} value={fontName}>
                      {fontName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Secondary font
                <p className="builder-format-toolbar-note">Used for monospace/code text roles.</p>
                <select
                  value={selectedSecondaryFont}
                  disabled={!hasAvailableFonts}
                  onChange={(event) => updateToken("--font-mono", buildSecondaryFontStack(event.target.value))}
                >
                  {!hasAvailableFonts && <option value="">No fonts available</option>}
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
            <p>Tune container width and shared spacing tokens.</p>
          </div>
          <div className="builder-styles-fields">
            {spacingFields.map((field) => (
              <label key={field.variable}>
                {field.label}
                <p className="builder-format-toolbar-note">{field.description}</p>
                <input
                  value={getCssVariableValue(tokensCss, field.variable, "")}
                  onChange={(event) => updateToken(field.variable, event.target.value)}
                />
              </label>
            ))}
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
