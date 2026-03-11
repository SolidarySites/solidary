import { Link } from "react-router-dom";
import { useLandingTitleTooltipBounds } from "../hooks/useLandingTitleTooltipBounds";

export function LandingMasthead() {
  const { mastheadRef, termRef } = useLandingTitleTooltipBounds();

  return (
    <section ref={mastheadRef} className="landing-masthead" aria-labelledby="landing-home-title">
      <div className="landing-masthead-copy">
        <h1 id="landing-home-title" className="landing-home-title">
          <span className="landing-home-title-leading">
            Websites published with{" "}
            <span
              ref={termRef}
              className="landing-home-title-term"
              tabIndex={0}
              aria-describedby="landing-home-title-tooltip"
            >
              Solidary
              <span
                id="landing-home-title-tooltip"
                className="landing-home-title-tooltip"
                role="tooltip"
              >
                * (of a group or community) characterized by solidarity or coincidence of
                interests.
              </span>
            </span>
          </span>
        </h1>
        <p className="landing-lead">
          are independently published sites that have a shared public infrastructure 
          without centralized ownership. Invite others to collaborate on your sites and 
          connect with other Solidary sites. Scroll down to discover what is currently 
          live on the network.
        </p>
        <div className="landing-actions">
          <Link to="/support" className="landing-primary-link">
            SUPPORT
          </Link>
          <Link to="/contact" className="landing-secondary-link">
            CONTACT
          </Link>
        </div>
      </div>
      <div className="landing-masthead-support">
        <div className="landing-support-copy">
          <h3>Mission</h3>
          <p>
            Solidary lets you publish websites that you control, keep them linked to one
            another, and make them easier to discover without handing everything over to a single
            platform. Each site lives in your own GitHub repository, published as a static site,
            and still belongs to a shared public network.
            <br />
            <br />
            The aim is a more personal and connected internet: one where publishing feels open,
            legible, and owned by the people making it. You should give it a go if you also think
            the web should work more like a public commons than a set of isolated rented spaces.
          </p>
        </div>
      </div>
    </section>
  );
}
