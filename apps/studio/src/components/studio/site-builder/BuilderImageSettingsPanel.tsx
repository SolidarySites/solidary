type BuilderImageSettingsPanelProps = {
  image: {
    src: string;
    alt: string;
    caption: string;
    sizePercent: number;
  } | null;
  onAltChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onSizeChange: (value: number) => void;
};

const BuilderImageSettingsPanel = ({
  image,
  onAltChange,
  onCaptionChange,
  onSizeChange
}: BuilderImageSettingsPanelProps) => {
  if (!image) {
    return (
      <section className="builder-section builder-image-settings">
        <h3>Image Settings</h3>
        <p className="builder-image-settings-empty">Select an image in the preview to edit it.</p>
      </section>
    );
  }

  return (
    <section className="builder-section builder-image-settings">
      <h3>Image Settings</h3>
      <label>
        URL
        <input value={image.src} readOnly />
      </label>
      <label>
        Alt text
        <input
          value={image.alt}
          onChange={(event) => onAltChange(event.target.value)}
          placeholder="Describe the image"
        />
      </label>
      <label>
        Figcaption
        <input
          value={image.caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder="Add a caption"
        />
      </label>
      <label>
        <div className="builder-image-settings-size-row">
          <span>Size</span>
          <span>{image.sizePercent}%</span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={image.sizePercent}
          onChange={(event) => onSizeChange(Number.parseInt(event.target.value, 10))}
        />
      </label>
    </section>
  );
};

export default BuilderImageSettingsPanel;
