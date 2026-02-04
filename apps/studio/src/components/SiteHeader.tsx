import type { Session } from "@supabase/supabase-js";
import { NavLink } from "react-router-dom";

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "nav-link active" : "nav-link";

type SiteHeaderProps = {
  session: Session | null;
  showAuthActions?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
};

export default function SiteHeader({
  session,
  showAuthActions = false,
  onSignIn,
  onSignOut
}: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-mark">●</span>
        <div>
          <div className="brand-title">Solidary Links Studio</div>
          <div className="brand-subtitle">A slow web toolkit.</div>
        </div>
      </div>
      <nav className="site-nav" aria-label="Primary">
        <NavLink to="/" className={navClass} end>
          Home
        </NavLink>
        <NavLink to="/studio" className={navClass}>
          Studio
        </NavLink>
      </nav>
      {showAuthActions && (
        <div className="auth-actions">
          {!session ? (
            <button className="ghost" onClick={onSignIn}>
              Sign in with GitHub
            </button>
          ) : (
            <button className="ghost" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      )}
    </header>
  );
}
