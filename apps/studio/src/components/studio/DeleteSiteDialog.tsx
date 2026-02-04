type DeleteSiteDialogProps = {
  open: boolean;
  title: string;
  repoFullName: string;
  mode: "builder" | "github" | null;
  confirmText: string;
  busy: boolean;
  onModeChange: (mode: "builder" | "github") => void;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteSiteDialog({
  open,
  title,
  repoFullName,
  mode,
  confirmText,
  busy,
  onModeChange,
  onConfirmTextChange,
  onCancel,
  onConfirm
}: DeleteSiteDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <div>
          <p className="dialog-eyebrow">Delete site</p>
          <h3 id="delete-title">{title || repoFullName}</h3>
          <p>Choose how you want to remove this site.</p>
        </div>

        <div className="dialog-options">
          <button
            type="button"
            className={mode === "builder" ? "primary" : "ghost"}
            onClick={() => onModeChange("builder")}
            disabled={busy}
          >
            Remove from builder
          </button>
          <button
            type="button"
            className={mode === "github" ? "primary" : "ghost"}
            onClick={() => onModeChange("github")}
            disabled={busy}
          >
            Remove from builder + GitHub
          </button>
        </div>

        {mode === "builder" && (
          <div className="dialog-panel">
            <p>This removes the site from Studio only. Your GitHub repo stays intact.</p>
          </div>
        )}

        {mode === "github" && (
          <div className="dialog-panel">
            <p>This permanently deletes the GitHub repo. Type the repo name to confirm.</p>
            <label className="dialog-label">
              Confirm repo
              <input
                value={confirmText}
                onChange={(event) => onConfirmTextChange(event.target.value)}
                placeholder={repoFullName}
              />
            </label>
          </div>
        )}

        <div className="dialog-actions">
          <button className="ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            type="button"
            onClick={onConfirm}
            disabled={busy || !mode || (mode === "github" && !confirmText.trim())}
          >
            {busy ? "Working..." : "Confirm delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
