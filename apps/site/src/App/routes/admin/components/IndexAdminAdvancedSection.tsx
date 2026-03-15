import { useMemo } from "react";
import type { IndexAdminArchiveState, IndexAdminSetup } from "../services/types";

type IndexAdminAdvancedSectionProps = {
  archive: IndexAdminArchiveState;
  setup: IndexAdminSetup | null;
  domainValue: string;
  saving: boolean;
  canManage: boolean;
  onDomainValueChange: (value: string) => void;
  onSaveDomain: () => void;
  onResetDomain: () => void;
};

const normalizeDomainInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/\.+$/, "").toLowerCase();
};

export default function IndexAdminAdvancedSection({
  archive,
  setup,
  domainValue,
  saving,
  canManage,
  onDomainValueChange,
  onSaveDomain,
  onResetDomain
}: IndexAdminAdvancedSectionProps) {
  const normalizedDomain = useMemo(() => normalizeDomainInput(domainValue), [domainValue]);

  return (
    <div className="builder-section builder-advanced-section">
      <div className="section-header">
        <h2>Advanced</h2>
        <p>Manage standalone hosting details and quick links to the provisioned resources.</p>
      </div>

      <div className="admin-advanced-links">
        {archive.repoUrl && (
          <a href={archive.repoUrl} target="_blank" rel="noreferrer" className="site-card-action-link">
            GitHub repo
          </a>
        )}
        {archive.supabaseDashboardUrl && (
          <a
            href={archive.supabaseDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="site-card-action-link"
          >
            Supabase project
          </a>
        )}
        {setup?.standaloneAdminUrl && (
          <a
            href={setup.standaloneAdminUrl}
            target="_blank"
            rel="noreferrer"
            className="site-card-action-link"
          >
            Standalone /admin
          </a>
        )}
      </div>

      <div className="builder-advanced-domain-panel">
        <h3>Custom domain</h3>
        <p>Connect a custom domain to the standalone index GitHub Pages deployment.</p>
        <label className="builder-delete-site-label">
          Domain
          <input
            value={domainValue}
            onChange={(event) => onDomainValueChange(event.target.value)}
            placeholder="example.com"
            spellCheck={false}
            disabled={!canManage}
          />
        </label>
        {!canManage && (
          <p className="builder-collaborator-hint">
            Only the owner can update custom domain settings.
          </p>
        )}
        <div className="builder-advanced-dns-feedback-actions">
          <button
            type="button"
            className="primary"
            disabled={!canManage || !normalizedDomain || saving}
            onClick={onSaveDomain}
          >
            {saving ? "Saving..." : "Connect domain"}
          </button>
          <button type="button" className="ghost" disabled={!canManage || saving} onClick={onResetDomain}>
            {saving ? "Working..." : "Reset to GitHub Pages"}
          </button>
        </div>
      </div>

      {setup && (
        <div className="builder-advanced-domain-panel">
          <h3>OAuth setup reference</h3>
          <dl className="admin-advanced-reference">
            <div>
              <dt>Standalone site URL</dt>
              <dd>{setup.liveUrl || archive.canonicalUrl || "-"}</dd>
            </div>
            <div>
              <dt>Auth callback URL</dt>
              <dd>{setup.authCallbackUrl || "-"}</dd>
            </div>
            <div>
              <dt>Supabase provider settings</dt>
              <dd>
                {setup.authProvidersDashboardUrl ? (
                  <a href={setup.authProvidersDashboardUrl} target="_blank" rel="noreferrer">
                    Open provider settings
                  </a>
                ) : (
                  "-"
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
