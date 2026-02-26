import ConnectionExplorer from "./ConnectionExplorer";

type ConnectionsSettingsSectionProps = {
  draftId: string | null;
};

const ConnectionsSettingsSection = ({
  draftId
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
  </div>
);

export default ConnectionsSettingsSection;
