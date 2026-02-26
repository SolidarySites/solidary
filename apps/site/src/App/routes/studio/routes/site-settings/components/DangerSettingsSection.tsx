type DangerSettingsSectionProps = {
  ownerAccess: boolean;
  canDeleteSite?: boolean;
  deleteMode?: "builder" | "github" | null;
  deleteConfirmText?: string;
  deleteBusy?: boolean;
  deleteRepoFullName?: string;
  onDeleteModeChange?: (mode: "builder" | "github") => void;
  onDeleteConfirmTextChange?: (value: string) => void;
  onDeleteReset?: () => void;
  onDeleteConfirm?: () => void;
};

const DangerSettingsSection = ({
  ownerAccess,
  canDeleteSite = false,
  deleteMode = null,
  deleteConfirmText = "",
  deleteBusy = false,
  deleteRepoFullName = "",
  onDeleteModeChange,
  onDeleteConfirmTextChange,
  onDeleteReset,
  onDeleteConfirm
}: DangerSettingsSectionProps) => (
  <div className="builder-section builder-delete-site-section">
    <div className="section-header">
      <h2>Danger</h2>
      <p>These actions are destructive and cannot be undone.</p>
    </div>

    {!ownerAccess && (
      <p className="builder-collaborator-hint">
        Only the site owner can access and run dangerous actions.
      </p>
    )}

    {ownerAccess && !canDeleteSite && (
      <p className="builder-collaborator-hint">Site deletion is unavailable for this draft.</p>
    )}

    {ownerAccess && canDeleteSite && (
      <>
        <div className="builder-delete-site-options">
          <button
            type="button"
            className={deleteMode === "builder" ? "primary" : "ghost"}
            onClick={() => onDeleteModeChange?.("builder")}
            disabled={deleteBusy}
          >
            Remove from builder
          </button>
          <button
            type="button"
            className={deleteMode === "github" ? "primary" : "ghost"}
            onClick={() => onDeleteModeChange?.("github")}
            disabled={deleteBusy}
          >
            Remove from builder + GitHub
          </button>
        </div>

        {deleteMode === "builder" && (
          <div className="builder-delete-site-panel">
            <p>This removes the site from Studio only. Your GitHub repo stays intact.</p>
          </div>
        )}

        {deleteMode === "github" && (
          <div className="builder-delete-site-panel">
            <p>This permanently deletes the GitHub repo. Type the repo name to confirm.</p>
            <label className="builder-delete-site-label">
              Confirm repo
              <input
                value={deleteConfirmText}
                onChange={(event) => onDeleteConfirmTextChange?.(event.target.value)}
                placeholder={deleteRepoFullName}
              />
            </label>
          </div>
        )}

        <div className="builder-delete-site-actions">
          <button className="ghost" type="button" onClick={onDeleteReset} disabled={deleteBusy}>
            Reset
          </button>
          <button
            className="primary"
            type="button"
            onClick={onDeleteConfirm}
            disabled={deleteBusy || !deleteMode || (deleteMode === "github" && !deleteConfirmText.trim())}
          >
            {deleteBusy ? "Working..." : "Confirm delete"}
          </button>
        </div>
      </>
    )}
  </div>
);

export default DangerSettingsSection;
