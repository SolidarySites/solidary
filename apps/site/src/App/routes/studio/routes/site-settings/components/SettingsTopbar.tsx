import type { StudioSettingsSection } from "../services/settings-sections";
import LockAvatarPill from "../../site-builder/components/LockAvatarPill";

type SectionButton = {
  section: StudioSettingsSection;
  label: string;
  disabled: boolean;
  lockedByOther: boolean;
  lockHolderName: string | null;
  lockHolderAvatarUrl: string | null;
};

type SettingsTopbarProps = {
  activeSection: StudioSettingsSection;
  sectionButtons: SectionButton[];
  onSectionChange: (section: StudioSettingsSection) => void;
};

const SettingsTopbar = ({
  activeSection,
  sectionButtons,
  onSectionChange
}: SettingsTopbarProps) => (
  <div className="builder-topbar studio-settings-topbar">
    <div className="studio-settings-topbar-sections">
      {sectionButtons.map((button) => (
        <button
          key={button.section}
          type="button"
          className={`builder-topbar-link-button ${activeSection === button.section ? "is-active" : ""} ${
            button.lockedByOther && activeSection !== button.section ? "is-locked" : ""
          }`.trim()}
          disabled={button.disabled}
          onClick={() => onSectionChange(button.section)}
        >
          <span className="builder-section-nav-label">{button.label}</span>
          {button.lockHolderName && (
            <LockAvatarPill
              holderName={button.lockHolderName}
              holderAvatarUrl={button.lockHolderAvatarUrl}
            />
          )}
        </button>
      ))}
    </div>
  </div>
);

export default SettingsTopbar;
