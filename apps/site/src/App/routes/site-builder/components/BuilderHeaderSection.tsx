type HeaderNavItem = {
  slug: string;
  label: string;
};

type BuilderHeaderSectionProps = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
  navItems: HeaderNavItem[];
  onDisabledChange: (value: boolean) => void;
  onFixedChange: (value: boolean) => void;
  onBrandTextChange: (value: string) => void;
  onDisableBrandChange: (value: boolean) => void;
  onMoveNavItemUp: (slug: string) => void;
  onMoveNavItemDown: (slug: string) => void;
};

const BuilderHeaderSection = ({
  disabled,
  fixed,
  brandText,
  disableBrand,
  navItems,
  onDisabledChange,
  onFixedChange,
  onBrandTextChange,
  onDisableBrandChange,
  onMoveNavItemUp,
  onMoveNavItemDown
}: BuilderHeaderSectionProps) => (
  <div className="builder-section">
    <div className="section-header">
      <h2>Header</h2>
      <p>Configure visibility, nav ordering, and brand behavior for the site header.</p>
    </div>

    <label className="checkbox">
      <input
        type="checkbox"
        checked={disabled}
        onChange={(event) => onDisabledChange(event.target.checked)}
      />
      Hide header
    </label>

    <label className="checkbox">
      <input type="checkbox" checked={fixed} onChange={(event) => onFixedChange(event.target.checked)} />
      Make header fixed
    </label>

    <label>
      Home link text:
      <input value={brandText} onChange={(event) => onBrandTextChange(event.target.value)} />
    </label>

    <label className="checkbox">
      <input
        type="checkbox"
        checked={disableBrand}
        onChange={(event) => onDisableBrandChange(event.target.checked)}
      />
      Hide home link
    </label>

    <div className="section-header">
      <h3>Nav Order</h3>
      <p>Move items up or down to control header navigation order.</p>
    </div>
    <div className="builder-page-list">
      {navItems.map((item, index) => (
        <div key={item.slug} className="builder-page-card">
          <strong>{item.label}</strong>
          <div className="builder-actions-buttons">
            <button
              type="button"
              className="ghost"
              onClick={() => onMoveNavItemUp(item.slug)}
              disabled={index === 0}
            >
              Move up
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => onMoveNavItemDown(item.slug)}
              disabled={index === navItems.length - 1}
            >
              Move down
            </button>
          </div>
        </div>
      ))}
      {!navItems.length && <p>No navigation pages are currently visible.</p>}
    </div>
  </div>
);

export default BuilderHeaderSection;
