import { useEffect, useState } from "react";

type DangerSettingsSectionProps = {
  ownerAccess: boolean;
  siteUrl: string;
  domainActionBusy?: "none" | "github" | "reset" | "studio";
  domainDnsFeedback?: {
    domain: string;
    status: "valid" | "invalid" | "pending";
    message: string;
  } | null;
  showGithubPagesDomainConnect?: boolean;
  canResetGitHubPagesDomain?: boolean;
  resetGitHubPagesUrl?: string | null;
  onStudioOnlyDomainUpdate?: (value: string) => Promise<void>;
  onConnectGithubDomain?: (value: string) => void;
  onRecheckGithubDomain?: (value: string) => void;
  onResetGithubDomain?: () => void;
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
  domainDnsFeedback = null,
  showGithubPagesDomainConnect = true,
  canResetGitHubPagesDomain = false,
  resetGitHubPagesUrl = null,
  onStudioOnlyDomainUpdate,
  onConnectGithubDomain,
  onRecheckGithubDomain,
  onResetGithubDomain,
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
  const [connectDomainInput, setConnectDomainInput] = useState(siteUrl);
  const [studioOnlyDomainInput, setStudioOnlyDomainInput] = useState(siteUrl);

  useEffect(() => {
    setConnectDomainInput(siteUrl);
    setStudioOnlyDomainInput(siteUrl);
  }, [siteUrl]);

  const normalizedConnectDomain = normalizeDomainInput(connectDomainInput);
  const hasConnectDomainValue = Boolean(normalizedConnectDomain);
  const normalizedStudioOnlyDomain = normalizeDomainInput(studioOnlyDomainInput);
  const hasStudioOnlyDomainValue = Boolean(normalizedStudioOnlyDomain);
  const domainActionsBusy = domainActionBusy !== "none";
  const connectButtonLabel = domainActionBusy === "github" ? "Checking..." : "CONNECT CUSTOM DOMAIN";
  const studioOnlyButtonLabel =
    domainActionBusy === "studio" ? "Updating..." : "Update to URL provided by another host";
  const resetButtonLabel =
    domainActionBusy === "reset" ? "Resetting..." : "Reset to GitHub Pages Domain";

  return (
    <div className="builder-section builder-advanced-section">
      <div className="section-header">
        <h2>Advanced</h2>
        <p>Manage custom domains and destructive site actions.</p>
      </div>

      {!ownerAccess && (
        <p className="builder-collaborator-hint">
          Only the site owner can access advanced actions.
        </p>
      )}

      {ownerAccess && (
        <div className="builder-advanced-domain-panel">
          {showGithubPagesDomainConnect && (
            <>
              <h3>Connect Custom Domain</h3>
              <p>
                Before connecting, set these A records for your apex domain at your DNS provider:
              </p>
              <ul className="builder-advanced-domain-records">
                <li><code>185.199.108.153</code></li>
                <li><code>185.199.109.153</code></li>
                <li><code>185.199.110.153</code></li>
                <li><code>185.199.111.153</code></li>
              </ul>
              <p className="builder-collaborator-hint">
                Full setup docs:{" "}
                <a
                  href="https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub Pages custom domain guide
                </a>
              </p>
              <p className="builder-advanced-warning">
                Warning: Do not connect the domain until DNS records are configured with your domain
                provider.
              </p>
              <label className="builder-delete-site-label">
                Domain
                <input
                  value={connectDomainInput}
                  onChange={(event) => setConnectDomainInput(event.target.value)}
                  placeholder="example.com"
                  spellCheck={false}
                />
              </label>
              <button
                type="button"
                className="primary"
                disabled={!hasConnectDomainValue || domainActionsBusy || deleteBusy}
                onClick={() => onConnectGithubDomain?.(connectDomainInput)}
              >
                {connectButtonLabel}
              </button>

              {domainDnsFeedback && (
                <div className="builder-advanced-dns-feedback">
                  <p>{domainDnsFeedback.message}</p>
                  <div className="builder-advanced-dns-feedback-actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={domainActionsBusy || deleteBusy}
                      onClick={() => onRecheckGithubDomain?.(domainDnsFeedback.domain)}
                    >
                      {domainActionBusy === "github" ? "Rechecking..." : "Recheck DNS"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={domainActionsBusy || deleteBusy}
                      onClick={() => onResetGithubDomain?.()}
                    >
                      {resetButtonLabel}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {canResetGitHubPagesDomain && (
            <div className="builder-advanced-dns-feedback">
              <p>
                Reset the site back to its default GitHub Pages URL.
                {resetGitHubPagesUrl ? ` Target: ${resetGitHubPagesUrl}` : ""}
              </p>
              <div className="builder-advanced-dns-feedback-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={domainActionsBusy || deleteBusy}
                  onClick={() => onResetGithubDomain?.()}
                >
                  {resetButtonLabel}
                </button>
              </div>
            </div>
          )}

          <details className="builder-advanced-dropdown">
            <summary>Externally Hosted Site</summary>
            <div className="builder-advanced-dropdown-body">
              <label className="builder-delete-site-label">
                Only set a domain here if your site is hosted by a different provider like Netlify 
                or Vercel, or if you are self-hosting and know what you are doing.
                <input
                  value={studioOnlyDomainInput}
                  onChange={(event) => setStudioOnlyDomainInput(event.target.value)}
                  placeholder="external-hosted.example.com"
                  spellCheck={false}
                />
              </label>
              <p className="builder-advanced-warning">
                Warning: This will stop GitHub Pages from serving your site. If your site is not 
                hosted elsewhere than GitHub Pages, the site will no longer be available online 
                until you revert back to GitHub Pages.
              </p>
              <button
                type="button"
                className="ghost"
                disabled={!hasStudioOnlyDomainValue || domainActionsBusy || deleteBusy}
                onClick={() => onStudioOnlyDomainUpdate?.(studioOnlyDomainInput)}
              >
                {studioOnlyButtonLabel}
              </button>
            </div>
          </details>
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
