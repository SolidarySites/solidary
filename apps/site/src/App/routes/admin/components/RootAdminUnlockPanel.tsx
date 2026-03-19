type RootAdminUnlockPanelProps = {
  password: string;
  unlocking: boolean;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
};

export default function RootAdminUnlockPanel({
  password,
  unlocking,
  onPasswordChange,
  onUnlock
}: RootAdminUnlockPanelProps) {
  return (
    <section className="builder-section admin-root-unlock-panel">
      <div className="section-header">
        <h2>Unlock Root Admin</h2>
        <p>
          `/admin` is reserved for the Solidary root index. Enter the shared admin password to
          manage root connections.
        </p>
      </div>

      <label>
        Admin password
        <input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="current-password"
        />
      </label>

      <div className="studio-settings-save-row admin-save-row-inline">
        <button className="primary" type="button" onClick={onUnlock} disabled={unlocking || !password.trim()}>
          {unlocking ? "Unlocking..." : "Unlock /admin"}
        </button>
      </div>
    </section>
  );
}
