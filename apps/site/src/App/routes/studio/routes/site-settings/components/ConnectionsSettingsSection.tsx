import ConnectionExplorer from "./ConnectionExplorer";

type ConnectionsSettingsSectionProps = {
  draftId: string | null;
  canSaveToLive: boolean;
  savingToLive: boolean;
  onSaveToLive: () => void;
};

const ConnectionsSettingsSection = ({
  draftId,
  canSaveToLive,
  savingToLive,
  onSaveToLive
}: ConnectionsSettingsSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Connections</h2>
      <p>Invite other sites and review incoming connection requests.</p>
    </div>

    {draftId ? (
      <ConnectionExplorer draftId={draftId} />
    ) : (
      <p className="builder-collaborator-hint">Save your draft first to manage connections.</p>
    )}

    <div className="studio-settings-save-row">
      <button
        className="primary"
        type="button"
        disabled={!canSaveToLive || savingToLive}
        onClick={onSaveToLive}
      >
        {savingToLive ? "Saving..." : "Save"}
      </button>
    </div>
  </div>
);

export default ConnectionsSettingsSection;
