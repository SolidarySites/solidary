import { html as htmlLanguage } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";

type BuilderHeadSectionProps = {
  headHtml: string;
  onHeadHtmlChange: (value: string) => void;
};

const headEditorExtensions = [htmlLanguage(), EditorView.lineWrapping];
const headEditorBasicSetup = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  autocompletion: true
};

const BuilderHeadSection = ({ headHtml, onHeadHtmlChange }: BuilderHeadSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Head</h2>
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
      aria-label="Head HTML"
    />
    <p className="builder-format-toolbar-note">
      This content is published to <code>src/content/seo.md</code> and injected by{" "}
      <code>src/components/SEO.astro</code>.
    </p>
  </div>
);

export default BuilderHeadSection;
