type BuilderFooterSectionProps = {
  disabled: boolean;
  fixed: boolean;
  disableCopyright: boolean;
  copyrightName: string;
  customText: string;
  customLinksInput: string;
  onDisabledChange: (value: boolean) => void;
  onFixedChange: (value: boolean) => void;
  onDisableCopyrightChange: (value: boolean) => void;
  onCopyrightNameChange: (value: string) => void;
  onCustomTextChange: (value: string) => void;
  onCustomLinksInputChange: (value: string) => void;
};

const BuilderFooterSection = ({
  disabled,
  fixed,
  disableCopyright,
  copyrightName,
  customText,
  customLinksInput,
  onDisabledChange,
  onFixedChange,
  onDisableCopyrightChange,
  onCopyrightNameChange,
  onCustomTextChange,
  onCustomLinksInputChange
}: BuilderFooterSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Footer</h2>
      <p>Configure visibility, copyright, and custom footer content.</p>
    </div>

    <label className="checkbox">
      <input
        type="checkbox"
        checked={disabled}
        onChange={(event) => onDisabledChange(event.target.checked)}
      />
      Hide footer
    </label>

    <label className="checkbox">
      <input type="checkbox" checked={fixed} onChange={(event) => onFixedChange(event.target.checked)} />
      Make footer fixed
    </label>

    <label className="checkbox">
      <input
        type="checkbox"
        checked={disableCopyright}
        onChange={(event) => onDisableCopyrightChange(event.target.checked)}
      />
      Hide copyright element
    </label>

    <label>
      Copyright name
      <input
        value={copyrightName}
        onChange={(event) => onCopyrightNameChange(event.target.value)}
      />
    </label>

    <label>
      Custom footer text
      <textarea
        value={customText}
        onChange={(event) => onCustomTextChange(event.target.value)}
        rows={3}
      />
    </label>

    <label>
      Custom footer links (one per line: `Label | URL`)
      <textarea
        value={customLinksInput}
        onChange={(event) => onCustomLinksInputChange(event.target.value)}
        rows={5}
      />
    </label>
  </div>
);

export default BuilderFooterSection;
