import { useCallback, useState } from "react";
import ConnectionExplorer from "./ConnectionExplorer";

type ConnectionsSettingsSectionProps = {
  draftId: string | null;
  canSaveToLive: boolean;
  savingToLive: boolean;
  onSaveToLive: () => Promise<void>;
};

const ConnectionsSettingsSection = ({
  draftId,
  canSaveToLive,
  savingToLive,
  onSaveToLive
}: ConnectionsSettingsSectionProps) => {
  const [liveMetadataDriftState, setLiveMetadataDriftState] = useState<{
    draftId: string | null;
    hasDrift: boolean;
  }>({
    draftId: null,
    hasDrift: false
  });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const hasLiveMetadataDrift =
    liveMetadataDriftState.draftId === draftId && liveMetadataDriftState.hasDrift;

  const handleSaveToLive = async () => {
    await onSaveToLive();
    setRefreshVersion((current) => current + 1);
  };

  const handleLiveMetadataDriftChange = useCallback(
    (hasDrift: boolean) => {
      setLiveMetadataDriftState((current) => {
        if (current.draftId === draftId && current.hasDrift === hasDrift) {
          return current;
        }

        return {
          draftId,
          hasDrift
        };
      });
    },
    [draftId]
  );

  return (
    <div className="builder-section">
      <div className="section-header">
        <h2>Connections</h2>
        <p>Invite sites or indexes and review incoming connection requests.</p>
      </div>

      {draftId ? (
        <ConnectionExplorer
          draftId={draftId}
          refreshVersion={refreshVersion}
          onLiveMetadataDriftChange={handleLiveMetadataDriftChange}
        />
      ) : (
        <p className="builder-collaborator-hint">Save your draft first to manage connections.</p>
      )}

      <div className="studio-settings-save-row">
        <button
          className="primary"
          type="button"
          disabled={!canSaveToLive || !hasLiveMetadataDrift || savingToLive}
          onClick={() => {
            void handleSaveToLive();
          }}
        >
          {savingToLive ? "Saving..." : hasLiveMetadataDrift ? "Update live metadata" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default ConnectionsSettingsSection;
