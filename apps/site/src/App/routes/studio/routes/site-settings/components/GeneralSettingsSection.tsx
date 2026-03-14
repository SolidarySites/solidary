import {
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_TITLE_LENGTH
} from "../../../../../services/site-metadata";
import { SiteSettingsImagePreview } from "./SiteSettingsImagePreview";

type GeneralSettingsSectionProps = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  siteImagePreview: string | null;
  dynamicImageLoadingEnabled: boolean;
  canSaveToLive: boolean;
  savingToLive: boolean;
  hasUnsavedChanges: boolean;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onDynamicImageLoadingChange: (value: boolean) => void;
  onSiteImageChange: (file: File | null) => void;
  onSaveToLive: () => void;
};

const GeneralSettingsSection = ({
  siteTitle,
  siteDescription,
  siteUrl,
  siteImagePreview,
  dynamicImageLoadingEnabled,
  canSaveToLive,
  savingToLive,
  hasUnsavedChanges,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onDynamicImageLoadingChange,
  onSiteImageChange,
  onSaveToLive
}: GeneralSettingsSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>General</h2>
      <p>Update your site metadata and hero text.</p>
    </div>
    <label>
      Site title
      <input
        value={siteTitle}
        maxLength={MAX_SITE_TITLE_LENGTH}
        onChange={(event) => onSiteTitleChange(event.target.value)}
      />
    </label>
    <label>
      Description
      <textarea
        value={siteDescription}
        maxLength={MAX_SITE_DESCRIPTION_LENGTH}
        onChange={(event) => onSiteDescriptionChange(event.target.value)}
        rows={4}
      />
    </label>
    <label>
      Domain
      <input value={siteUrl} readOnly />
    </label>
    <p className="builder-collaborator-hint">
      Domain changes are managed in the Advanced section.
    </p>
    <label>
      <input
        type="checkbox"
        checked={dynamicImageLoadingEnabled}
        onChange={(event) => onDynamicImageLoadingChange(event.target.checked)}
      />{" "}
      Dynamic image loading
    </label>
    <p className="builder-collaborator-hint">
      Serve managed page images as smaller variants on smaller displays.
    </p>
    <label>
      Site image (JPEG)
      <input
        type="file"
        accept="image/jpeg"
        onChange={(event) => onSiteImageChange(event.target.files?.[0] ?? null)}
      />
    </label>
    {siteImagePreview && (
      <SiteSettingsImagePreview siteUrl={siteUrl} src={siteImagePreview} alt="Preview" />
    )}
    <div className="studio-settings-save-row">
      <button
        className="primary"
        type="button"
        disabled={!canSaveToLive || !hasUnsavedChanges || savingToLive}
        onClick={onSaveToLive}
      >
        {savingToLive ? "Saving..." : "Save"}
      </button>
    </div>
  </div>
);

export default GeneralSettingsSection;
