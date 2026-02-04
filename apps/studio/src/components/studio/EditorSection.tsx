import type { RefObject } from "react";
import type { RepoFileSet, SiteDraft } from "../../studio/types";

type EditorSectionProps = {
  siteDraft: SiteDraft;
  repoFiles: RepoFileSet | null;
  contentHtml: string;
  editorRef: RefObject<HTMLDivElement | null>;
  onInput: () => void;
  onExecCommand: (command: string, value?: string) => void;
};

export default function EditorSection({
  siteDraft,
  repoFiles,
  contentHtml,
  editorRef,
  onInput,
  onExecCommand
}: EditorSectionProps) {
  return (
    <section className="editor">
      <div className="section-header">
        <h2>Site editor</h2>
        <p>Editing {siteDraft.repoFullName}</p>
      </div>
      <div className="editor-toolbar">
        <button type="button" className="ghost" onClick={() => onExecCommand("bold")}>
          Bold
        </button>
        <button type="button" className="ghost" onClick={() => onExecCommand("italic")}>
          Italic
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => onExecCommand("insertUnorderedList")}
        >
          List
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) onExecCommand("createLink", url);
          }}
        >
          Link
        </button>
      </div>
      <div className="editor-shell">
        <div
          ref={editorRef}
          className="editor-canvas"
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </div>
      <div className="editor-actions">
        <button className="primary" disabled>
          Push changes (coming soon)
        </button>
        <button className="ghost" disabled>
          Solidary Links settings
        </button>
        <button className="ghost" disabled>
          Theme
        </button>
        <button className="ghost" disabled>
          README
        </button>
      </div>
      {repoFiles && (
        <div className="editor-meta">
          <div>Config: {repoFiles.config.length} chars</div>
          <div>Solidary link: {repoFiles.solidary.length} chars</div>
        </div>
      )}
    </section>
  );
}
