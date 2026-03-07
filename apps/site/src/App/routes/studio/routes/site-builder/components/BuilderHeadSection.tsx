import { html as htmlLanguage } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { SEO_LOCALE_OPTIONS } from "../services/seo-locales";

type BuilderHeadSectionProps = {
  headHtml: string;
  seoLocale: string;
  seoTwitter: boolean;
  seoOpenGraph: boolean;
  seoStructuredData: boolean;
  seoIndexFollow: boolean;
  onSeoLocaleChange: (value: string) => void;
  onSeoTwitterChange: (value: boolean) => void;
  onSeoOpenGraphChange: (value: boolean) => void;
  onSeoStructuredDataChange: (value: boolean) => void;
  onSeoIndexFollowChange: (value: boolean) => void;
  onHeadHtmlChange: (value: string) => void;
};

const headEditorExtensions = [htmlLanguage(), EditorView.lineWrapping];
const headEditorBasicSetup = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  autocompletion: true
};

const BuilderHeadSection = ({
  headHtml,
  seoLocale,
  seoTwitter,
  seoOpenGraph,
  seoStructuredData,
  seoIndexFollow,
  onSeoLocaleChange,
  onSeoTwitterChange,
  onSeoOpenGraphChange,
  onSeoStructuredDataChange,
  onSeoIndexFollowChange,
  onHeadHtmlChange
}: BuilderHeadSectionProps) => {
  const localeOptions = SEO_LOCALE_OPTIONS.some((option) => option.value === seoLocale)
    ? SEO_LOCALE_OPTIONS
    : [{ value: seoLocale, label: seoLocale }, ...SEO_LOCALE_OPTIONS];

  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>SEO</h2>
        <p>
          Configure document metadata defaults, social tags, robots behavior, and locale for{" "}
          <code>src/content/seo.md</code>.
        </p>
      </div>

      <label>
        Locale
        <p className="builder-format-toolbar-note">
          Used for <code>lang</code>, Open Graph locale, and default structured data language.
        </p>
        <select value={seoLocale} onChange={(event) => onSeoLocaleChange(event.target.value)}>
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={seoTwitter}
          onChange={(event) => onSeoTwitterChange(event.target.checked)}
        />
        Enable Twitter metadata
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={seoOpenGraph}
          onChange={(event) => onSeoOpenGraphChange(event.target.checked)}
        />
        Enable Open Graph metadata
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={seoStructuredData}
          onChange={(event) => onSeoStructuredDataChange(event.target.checked)}
        />
        Enable structured data
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={seoIndexFollow}
          onChange={(event) => onSeoIndexFollowChange(event.target.checked)}
        />
        Allow indexing and following
      </label>

      <div className="section-header">
        <h3>Custom head HTML</h3>
        <p>
          Add extra tags for <code>{`<head>`}</code>, such as custom metadata, scripts, and link tags.
        </p>
      </div>
      <CodeMirror
        className="builder-head-html-editor"
        value={headHtml}
        extensions={headEditorExtensions}
        basicSetup={headEditorBasicSetup}
        onChange={onHeadHtmlChange}
        height="280px"
        aria-label="Custom head HTML"
      />
      <p className="builder-format-toolbar-note">
        This content is injected by <code>src/components/SEO.astro</code>.
      </p>
    </div>
  );
};

export default BuilderHeadSection;
