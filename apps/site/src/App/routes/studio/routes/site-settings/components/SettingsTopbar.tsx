import type { PublishFeedback } from "../../site-builder/services/types";
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
  savingDraft: boolean;
  isProvisioning: boolean;
  canSaveDraft: boolean;
  canPublish: boolean;
  publishLabel: string;
  publishFeedback: PublishFeedback | null;
  onSectionChange: (section: StudioSettingsSection) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
};

const SettingsTopbar = ({
  activeSection,
  sectionButtons,
  savingDraft,
  isProvisioning,
  canSaveDraft,
  canPublish,
  publishLabel,
  publishFeedback,
  onSectionChange,
  onSaveDraft,
  onPublish
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

    <div className="studio-settings-topbar-actions">
      <button className="ghost" type="button" onClick={onSaveDraft} disabled={!canSaveDraft}>
        {savingDraft ? "Saving..." : "Save draft"}
      </button>
      <button className="primary" type="button" onClick={onPublish} disabled={!canPublish}>
        {isProvisioning
          ? `${publishLabel}...`
          : publishFeedback?.kind === "progress"
            ? "Building..."
            : publishLabel}
      </button>
    </div>
  </div>
);

export default SettingsTopbar;
