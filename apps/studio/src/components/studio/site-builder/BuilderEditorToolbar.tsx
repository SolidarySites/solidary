type BuilderEditorToolbarProps = {
  onRunCommand: (command: string, value?: string) => void;
  onRunLink: () => void;
};

const BuilderEditorToolbar = ({ onRunCommand, onRunLink }: BuilderEditorToolbarProps) => (
  <div className="builder-editor-toolbar" role="toolbar" aria-label="Formatting tools">
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("formatBlock", "p");
      }}
    >
      P
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("formatBlock", "h1");
      }}
    >
      H1
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("formatBlock", "h2");
      }}
    >
      H2
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("formatBlock", "h3");
      }}
    >
      H3
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("bold");
      }}
    >
      Bold
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("italic");
      }}
    >
      Italic
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("underline");
      }}
    >
      Underline
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("justifyLeft");
      }}
    >
      Left
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("justifyCenter");
      }}
    >
      Center
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("justifyRight");
      }}
    >
      Right
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("insertUnorderedList");
      }}
    >
      Bullets
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("insertOrderedList");
      }}
    >
      Numbered
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("formatBlock", "blockquote");
      }}
    >
      Quote
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunLink();
      }}
    >
      Link
    </button>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onRunCommand("clearAllFormatting");
      }}
    >
      Clear
    </button>
  </div>
);

export default BuilderEditorToolbar;
