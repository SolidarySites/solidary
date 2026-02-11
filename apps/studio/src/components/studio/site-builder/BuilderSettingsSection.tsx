type BuilderSettingsSectionProps = {
  siteUrl: string;
  siteLocale: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  onSiteUrlChange: (value: string) => void;
  onSiteLocaleChange: (value: string) => void;
  onAuthorNameChange: (value: string) => void;
  onAuthorEmailChange: (value: string) => void;
  onAuthorUrlChange: (value: string) => void;
};

const BuilderSettingsSection = ({
  siteUrl,
  siteLocale,
  authorName,
  authorEmail,
  authorUrl,
  onSiteUrlChange,
  onSiteLocaleChange,
  onAuthorNameChange,
  onAuthorEmailChange,
  onAuthorUrlChange
}: BuilderSettingsSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Settings</h2>
      <p>Configure your canonical URL, locale, and author settings.</p>
    </div>
    <label>
      Site URL
      <input value={siteUrl} onChange={(event) => onSiteUrlChange(event.target.value)} />
    </label>
    <label>
      Locale
      <input value={siteLocale} onChange={(event) => onSiteLocaleChange(event.target.value)} />
    </label>
    <div className="builder-grid">
      <label>
        Author name
        <input value={authorName} onChange={(event) => onAuthorNameChange(event.target.value)} />
      </label>
      <label>
        Author email
        <input value={authorEmail} onChange={(event) => onAuthorEmailChange(event.target.value)} />
      </label>
      <label>
        Author URL
        <input value={authorUrl} onChange={(event) => onAuthorUrlChange(event.target.value)} />
      </label>
    </div>
  </div>
);

export default BuilderSettingsSection;
