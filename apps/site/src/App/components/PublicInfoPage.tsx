import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./PublicInfoPage.css";

type PublicInfoAction = {
  href: string;
  label: string;
  external?: boolean;
};

type PublicInfoSection = {
  title: string;
  paragraphs: readonly string[];
  action?: PublicInfoAction;
};

type PublicInfoPageProps = {
  title: string;
  lead: string;
  note: string;
  sections: readonly PublicInfoSection[];
};

function PublicInfoActionLink({ action }: { action: PublicInfoAction }) {
  if (action.external) {
    return (
      <a
        className="public-info-link"
        href={action.href}
        target="_blank"
        rel="noreferrer"
      >
        {action.label}
      </a>
    );
  }

  return (
    <Link className="public-info-link" to={action.href}>
      {action.label}
    </Link>
  );
}

function renderParagraphs(paragraphs: readonly string[]): ReactNode {
  return paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>);
}

export default function PublicInfoPage({
  title,
  lead,
  note,
  sections
}: PublicInfoPageProps) {
  return (
    <div className="app-shell">
      <main className="main-content public-info-main-content">
        <section className="public-info-hero" aria-labelledby="public-info-title">
          <div className="public-info-copy">
            <h1 id="public-info-title">{title}</h1>
            <p className="public-info-lead">{lead}</p>
          </div>
          <div className="public-info-note-block">
            <p className="public-info-note">{note}</p>
          </div>
        </section>

        <section className="public-info-sections" aria-label={`${title} details`}>
          {sections.map((section) => (
            <article key={section.title} className="public-info-section">
              <h2>{section.title}</h2>
              <div className="public-info-section-copy">
                {renderParagraphs(section.paragraphs)}
              </div>
              {section.action && <PublicInfoActionLink action={section.action} />}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
