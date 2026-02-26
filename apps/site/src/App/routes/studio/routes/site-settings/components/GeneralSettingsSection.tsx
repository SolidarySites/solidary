type GeneralSettingsSectionProps = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  siteImagePreview: string | null;
  onSiteTitleChange: (value: string) => void;
  onSiteDescriptionChange: (value: string) => void;
  onSiteUrlChange: (value: string) => void;
  onSiteImageChange: (file: File | null) => void;
};

const GeneralSettingsSection = ({
  siteTitle,
  siteDescription,
  siteUrl,
  siteImagePreview,
  onSiteTitleChange,
  onSiteDescriptionChange,
  onSiteUrlChange,
  onSiteImageChange
}: GeneralSettingsSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>General</h2>
      <p>Update your site metadata and hero text.</p>
    </div>
    <label>
      Site title
      <input value={siteTitle} onChange={(event) => onSiteTitleChange(event.target.value)} />
    </label>
    <label>
      Description
      <textarea
        value={siteDescription}
        onChange={(event) => onSiteDescriptionChange(event.target.value)}
        rows={4}
      />
    </label>
    <label>
      Site URL
      <input value={siteUrl} onChange={(event) => onSiteUrlChange(event.target.value)} />
    </label>
    <label>
      Site image (JPEG)
      <input
        type="file"
        accept="image/jpeg"
        onChange={(event) => onSiteImageChange(event.target.files?.[0] ?? null)}
      />
    </label>
    {siteImagePreview && <img className="preview-image" src={siteImagePreview} alt="Preview" />}
  </div>
);

export default GeneralSettingsSection;
