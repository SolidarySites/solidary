import type { CSSProperties, ReactNode } from "react";
import type { BuilderStylesMode, FooterOptions, HeaderOptions } from "../../services/types";
import type { FooterSegment, PreviewNavItem } from "./types";

type AstroPreviewLayoutProps = {
  styleMode: BuilderStylesMode;
  previewStyle: CSSProperties;
  previewInlineCss: string;
  header: HeaderOptions;
  footer: FooterOptions;
  previewBrand: string;
  homePageSlug: string;
  navItems: PreviewNavItem[];
  activeSlug: string;
  footerModules: FooterOptions["modules"];
  footerInnerStyle?: CSSProperties;
  footerCopyright: string;
  onActivePageChange: (slug: string) => void;
  parseFooterLineSegments: (line: string) => FooterSegment[];
  editor: ReactNode;
};

const AstroPreviewLayout = ({
  styleMode,
  previewStyle,
  previewInlineCss,
  header,
  footer,
  previewBrand,
  homePageSlug,
  navItems,
  activeSlug,
  footerModules,
  footerInnerStyle,
  footerCopyright,
  onActivePageChange,
  parseFooterLineSegments,
  editor
}: AstroPreviewLayoutProps) => (
  <div className="astro-preview-shell">
    <div
      className={`astro-preview page ${styleMode === "advanced" ? "is-advanced" : "is-simple"}`}
      style={previewStyle}
    >
      {previewInlineCss && <style>{previewInlineCss}</style>}
      <a
        className="skip-link"
        href="#astro-preview-main"
        onClick={(event) => event.preventDefault()}
      >
        Skip to content
      </a>

      <header
        className="header"
        style={
          header.disabled
            ? { display: "none" }
            : header.fixed
              ? { position: "sticky", top: 0, zIndex: 40, background: "var(--header-bg, var(--bg))" }
              : undefined
        }
      >
        <div className="header__inner">
          <a
            className="header__brand"
            href="/"
            style={header.disableBrand ? { display: "none" } : undefined}
            onClick={(event) => {
              event.preventDefault();
              onActivePageChange(homePageSlug);
            }}
          >
            {header.brandText.trim() || previewBrand.trim() || "New Astro Site"}
          </a>

          {navItems.length > 0 && (
            <>
              <nav className="header__nav header__nav--desktop" aria-label="Primary">
                <ul className="nav">
                  {navItems.map((item) => (
                    <li className="nav__item" key={item.href}>
                      <a
                        className={`nav__link${activeSlug === item.slug ? " is-active" : ""}`}
                        href={item.href}
                        onClick={(event) => {
                          event.preventDefault();
                          onActivePageChange(item.slug);
                        }}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <details className="header__menu">
                <summary className="header__menu-toggle" aria-label="Toggle navigation menu">
                  <span className="header__menu-toggle-label">Menu</span>
                  <span className="header__menu-toggle-icon" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </summary>

                <nav className="header__nav header__nav--mobile" aria-label="Primary">
                  <ul className="nav">
                    {navItems.map((item) => (
                      <li className="nav__item" key={`mobile-${item.href}`}>
                        <a
                          className={`nav__link${activeSlug === item.slug ? " is-active" : ""}`}
                          href={item.href}
                          onClick={(event) => {
                            event.preventDefault();
                            const detailsElement = event.currentTarget.closest("details");
                            if (detailsElement instanceof HTMLDetailsElement) {
                              detailsElement.open = false;
                            }
                            onActivePageChange(item.slug);
                          }}
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </details>
            </>
          )}
        </div>
      </header>

      <main id="astro-preview-main" className="page__main">
        <article className="prose">{editor}</article>
      </main>

      <footer
        className="footer"
        style={
          footer.disabled
            ? { display: "none" }
            : footer.fixed
              ? { position: "sticky", bottom: 0, zIndex: 40, background: "var(--footer-bg, var(--bg))" }
              : undefined
        }
      >
        <div className="footer__inner" style={footerInnerStyle}>
          {footerModules.map((module, moduleIndex) => {
            const resolvedModule = module.content
              .replaceAll("%copyright%", footerCopyright)
              .replace(/\r/g, "");
            const lines = resolvedModule.split("\n");
            const alignmentClass = `footer__module--${module.alignment}`;
            const isEmptyModule = module.content.trim().length === 0;
            return (
              <p
                key={`footer-module-${moduleIndex}`}
                className={`footer__module ${alignmentClass}`}
                style={isEmptyModule ? { display: "none" } : undefined}
              >
                {lines.map((line, lineIndex) => (
                  <span key={`footer-module-${moduleIndex}-line-${lineIndex}`}>
                    {parseFooterLineSegments(line).map((segment, segmentIndex) =>
                      segment.type === "link" ? (
                        <a
                          key={`footer-module-${moduleIndex}-line-${lineIndex}-segment-${segmentIndex}`}
                          className="footer__link"
                          href={segment.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {segment.text}
                        </a>
                      ) : (
                        <span key={`footer-module-${moduleIndex}-line-${lineIndex}-segment-${segmentIndex}`}>
                          {segment.text}
                        </span>
                      )
                    )}
                    {lineIndex < lines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            );
          })}
        </div>
      </footer>
    </div>
  </div>
);

export default AstroPreviewLayout;
