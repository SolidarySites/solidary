type StudioMastheadProps = {
  sessionResolved: boolean;
  isAuthenticated: boolean;
  accountName: string;
  totalSiteCount: number;
  ownedSiteCount: number;
  sharedSiteCount: number;
  onSignIn: () => void;
};

const formatSiteCount = (count: number) => `${count} site${count === 1 ? "" : "s"}`;

const formatCollaboratorClause = (count: number) => {
  if (count === 0) {
    return "none are sites you collaborate on";
  }

  if (count === 1) {
    return "1 is a site you collaborate on";
  }

  return `${count} are sites you collaborate on`;
};

export default function StudioMasthead({
  sessionResolved,
  isAuthenticated,
  accountName,
  totalSiteCount,
  ownedSiteCount,
  sharedSiteCount,
  onSignIn
}: StudioMastheadProps) {
  if (!sessionResolved) {
    return null;
  }

  if (isAuthenticated) {
    return (
      <section className="studio-masthead studio-masthead-authenticated" aria-labelledby="studio-route-title">
        <div className="studio-masthead-copy">
          <h1 id="studio-route-title" className="studio-masthead-title">
            Studio
          </h1>
        </div>
        <div className="studio-masthead-support">
          <p className="studio-masthead-summary">
            Hello {accountName}, you&apos;re working on a total of {formatSiteCount(totalSiteCount)},
            out of which {ownedSiteCount} {ownedSiteCount === 1 ? "is" : "are"} owned by you and{" "}
            {formatCollaboratorClause(sharedSiteCount)}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="studio-masthead studio-masthead-unauthenticated" aria-labelledby="studio-route-title">
      <div className="studio-masthead-copy">
        <h1 id="studio-route-title" className="studio-masthead-title">
          Studio
        </h1>
        <p className="studio-masthead-lead">
          Once you have signed in with your GitHub account this is where you can 
          create new sites, edit existing ones, access the repositories behind your sites, invite others 
          to collaborate, and adjust the publicly available information about your sites.
        </p>
      </div>

      <div className="studio-masthead-support">
        <div className="studio-masthead-account-block">
          <p className="studio-masthead-account-name">
            Sign in with your GitHub account to start publishing.
          </p>
          <button type="button" className="studio-primary-button" onClick={onSignIn}>
            Sign in with GitHub
          </button>
        </div>
      </div>
    </section>
  );
}
