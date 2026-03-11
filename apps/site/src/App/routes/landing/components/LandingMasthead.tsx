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
          <h3>How It Works</h3>
          <p>
            Log in with your GitHub account and create a new site. Your site will live in your own GitHub 
            repository, and be published automatically as a GitHub page.  
            Solidary keeps track of all the sites and helps you make connections to other sites.
            Think of it as a publishing tool that also helps you find and connect with other publishers. 
            Non-technical users can create and manage their site with the easy-to-use Solidary site builder,
            and if you are more advanced you can customize your site as much as you want by working directly 
            with the GitHub repository.
          </p>
        </div>
      </div>
    </section>
  );
}
