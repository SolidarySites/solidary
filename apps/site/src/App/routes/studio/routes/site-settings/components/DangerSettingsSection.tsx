import { useEffect, useState } from "react";

type DangerSettingsSectionProps = {
  ownerAccess: boolean;
  siteUrl: string;
  domainActionBusy?: "none" | "github";
  onStudioOnlyDomainUpdate?: (value: string) => void;
  onConnectGithubDomain?: (value: string) => void;
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

const normalizeDomainInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const domainOnly = withoutProtocol.split("/")[0] ?? "";
  return domainOnly.replace(/\.+$/, "").trim().toLowerCase();
};

const DangerSettingsSection = ({
  ownerAccess,
  siteUrl,
  domainActionBusy = "none",
  onStudioOnlyDomainUpdate,
  onConnectGithubDomain,
  canDeleteSite = false,
  deleteMode = null,
  deleteConfirmText = "",
  deleteBusy = false,
  deleteRepoFullName = "",
  onDeleteModeChange,
  onDeleteConfirmTextChange,
  onDeleteReset,
  onDeleteConfirm
}: DangerSettingsSectionProps) => {
  const [domainInput, setDomainInput] = useState(siteUrl);

  useEffect(() => {
    setDomainInput(siteUrl);
  }, [siteUrl]);

  const normalizedDomain = normalizeDomainInput(domainInput);
  const hasDomainValue = Boolean(normalizedDomain);
  const domainActionsBusy = domainActionBusy !== "none";

  return (
    <div className="builder-section builder-advanced-section">
      <div className="section-header">
        <h2>Advanced</h2>
        <p>Manage custom domain behavior and destructive site actions.</p>
      </div>

      {!ownerAccess && (
        <p className="builder-collaborator-hint">
          Only the site owner can access advanced actions.
        </p>
      )}

      {ownerAccess && (
        <div className="builder-advanced-domain-panel">
          <h3>Domain</h3>
          <p>
            Update your domain in Studio, then optionally sync it to GitHub Pages as a custom
            domain.
          </p>
          <label className="builder-delete-site-label">
            Domain
            <input
              value={domainInput}
              onChange={(event) => setDomainInput(event.target.value)}
              placeholder="example.com"
              spellCheck={false}
            />
          </label>

          <p className="builder-advanced-warning">
            Warning: If this domain is changed without external DNS/domain management in place,
            your published site and Solidary Studio site builder will stop working.
          </p>

          <div className="builder-delete-site-options">
            <button
              type="button"
              className="ghost"
              disabled={!hasDomainValue || domainActionsBusy || deleteBusy}
              onClick={() => onStudioOnlyDomainUpdate?.(domainInput)}
            >
              Use in Studio only
            </button>
            <button
              type="button"
              className="primary"
              disabled={!hasDomainValue || domainActionsBusy || deleteBusy}
              onClick={() => onConnectGithubDomain?.(domainInput)}
            >
              {domainActionBusy === "github"
                ? "Connecting..."
                : "Connect on GitHub Pages + Studio"}
            </button>
          </div>
        </div>
      )}

      {ownerAccess && <div className="builder-delete-site-divider" />}

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
              disabled={
                deleteBusy || !deleteMode || (deleteMode === "github" && !deleteConfirmText.trim())
              }
            >
              {deleteBusy ? "Working..." : "Confirm delete"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default DangerSettingsSection;
