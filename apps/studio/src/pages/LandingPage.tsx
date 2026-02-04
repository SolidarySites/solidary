import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

export default function LandingPage() {
  return (
    <div className="app-shell">
      <SiteHeader session={null} />
      <main className="main-content">
        <section className="landing-hero">
          <div>
            <p className="eyebrow">Solidary Links</p>
            <h1>Publish slow web sites with a single GitHub repo.</h1>
            <p>
              Solidary Links Studio helps you compose sites, enable GitHub Pages, and share the
              protocol metadata that keeps the slow web connected.
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
          <div className="landing-panel">
            <div className="panel-card">
              <h2>What you can do</h2>
              <ul>
                <li>Generate a ready-to-host Jekyll site.</li>
                <li>Publish to GitHub Pages in minutes.</li>
                <li>Ship the Solidary Links metadata automatically.</li>
              </ul>
            </div>
          </div>
        </section>
        <section id="features" className="landing-grid">
          <div className="landing-card">
            <h3>Slow web templates</h3>
            <p>Start with a minimalist theme that works for portfolios, reading lists, and notes.</p>
          </div>
          <div className="landing-card">
            <h3>One-click provisioning</h3>
            <p>Studio handles repos, commits, and GitHub Pages setup in the background.</p>
          </div>
          <div className="landing-card">
            <h3>Protocol-ready metadata</h3>
            <p>Ship the Solidary Links JSON so directories can discover your site.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
