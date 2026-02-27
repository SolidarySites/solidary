import type { StudioSettingsSection } from "../services/settings-sections";

type SectionButton = {
  section: StudioSettingsSection;
  label: string;
  disabled: boolean;
  lockedByOther: boolean;
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
          {button.label}
        </button>
      ))}
    </div>
  </div>
);

export default SettingsTopbar;
