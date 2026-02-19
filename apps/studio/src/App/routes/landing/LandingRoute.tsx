import { Link } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";

export default function LandingRoute() {
  return (
    <div className="app-shell">
      <SiteHeader session={null} />
      <main className="main-content">
        <section className="landing-hero">
          <div>
            <p className="eyebrow">The Connected Static Web</p>
            <h1>Your website, your internet.</h1>
            <p>
              Solidary is a toolkit for creating and connecting static websites. Generate and edit your own site that you control, then share and connect with others in the Solidary web. Your site is your space to create, curate, and collaborate on the living web.
            </p>
            <div className="landing-actions">
              <Link to="/studio" className="primary-link">
                Open Studio
              </Link>
              <a className="ghost-link" href="#features">
                Learn more
              </a>
            </div>
          </div>
        </section>
        <section id="features" className="landing-grid">
          <div className="landing-card">
            <h3>Create a free website that you control</h3>
            <p>Easily create a free website that is yours to keep and modify forever.</p>
          </div>
          <div className="landing-card">
            <h3>Collaborate and connect.</h3>
            <p>Solidary doesn't hold your content hostage. It's a DIWO static web, where you choose who to connect and collaborate with, on or off the Solidary platform.</p>
          </div>
          <div className="landing-card">
            <h3>Create collections</h3>
            <p>Create collections of static websites and curate a living archive of the static web.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
