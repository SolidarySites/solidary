import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/hooks/useAuth";
import {
  getSessionAvatarUrl,
  getSessionDisplayName
} from "../features/auth/services/user-profile";

export default function SiteHeader() {
  const { session, signInWithGitHub, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const displayName = useMemo(() => getSessionDisplayName(session), [session]);
  const avatarImageUrl = useMemo(() => getSessionAvatarUrl(session), [session]);
  const avatarText = useMemo(() => displayName.slice(0, 1).toUpperCase() || "?", [displayName]);

  useEffect(() => {
    if (!menuOpen) return;

    const onWindowMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onWindowMouseDown);
    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("mousedown", onWindowMouseDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [menuOpen]);

  const handleSignIn = () => {
    setMenuOpen(false);
    void signInWithGitHub().catch((error) => {
      const message = error instanceof Error ? error.message : "Could not sign in with GitHub.";
      window.alert(message);
    });
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    void signOut()
      .then(() => {
        navigate("/");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Could not sign out.";
        window.alert(message);
      });
  };

  return (
    <header className="site-header">
      <div className="site-header-left">
        <Link className="brand" to="/" aria-label="Solidary home">
          <span className="brand-mark">●</span>
          <div className="brand-title">Solidary</div>
        </Link>

        <nav className="site-header-nav" aria-label="Primary">
          <Link
            className={`site-header-nav-link ${location.pathname === "/explorer" ? "is-active" : ""}`.trim()}
            to="/explorer"
          >
            Explorer
          </Link>
          <Link
            className={`site-header-nav-link ${location.pathname === "/search" ? "is-active" : ""}`.trim()}
            to="/search"
          >
            Search
          </Link>
          <Link
            className={`site-header-nav-link ${location.pathname.startsWith("/studio") ? "is-active" : ""}`.trim()}
            to="/studio"
          >
            Studio
          </Link>
        </nav>
      </div>

      <div className="profile-menu" ref={menuRef}>
        <button
          type="button"
          className={`avatar-button ${session ? "is-authenticated" : ""}`.trim()}
          aria-label={session ? `${displayName} account menu` : "Open account menu"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {session ? (
            avatarImageUrl ? (
              <span
                className="avatar-image"
                style={{ backgroundImage: `url(${avatarImageUrl})` }}
                aria-hidden="true"
              />
            ) : (
              <span className="avatar-pill">{avatarText}</span>
            )
          ) : (
            <span className="avatar-burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="profile-dropdown" role="menu" aria-label="Account menu">
            <div className="profile-dropdown-meta">
              <p className="profile-name">{session ? displayName : "Signed out"}</p>
              {session?.user.email && <p className="profile-email">{session.user.email}</p>}
            </div>
            {session && (
              <Link
                className="profile-menu-item"
                to="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Profile settings
              </Link>
            )}
            {!session ? (
              <button className="profile-menu-item" type="button" role="menuitem" onClick={handleSignIn}>
                Sign in with GitHub
              </button>
            ) : (
              <button className="profile-menu-item" type="button" role="menuitem" onClick={handleSignOut}>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
