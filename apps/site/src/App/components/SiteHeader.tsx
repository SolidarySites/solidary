import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/hooks/useAuth";
import "./SiteHeader.css";

const getUserDisplayName = (session: Session | null) => {
  const metadata = session?.user.user_metadata as Record<string, unknown> | undefined;
  const candidates = [
    metadata?.user_name,
    metadata?.preferred_username,
    metadata?.name,
    session?.user.email
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Guest";
};

export default function SiteHeader() {
  const { session, signInWithGitHub, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const displayName = useMemo(() => getUserDisplayName(session), [session]);
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
      <Link className="brand" to="/" aria-label="Solidary home">
        <span className="brand-mark">●</span>
        <div className="brand-title">Solidary</div>
      </Link>

      <div className="profile-menu" ref={menuRef}>
        <button
          type="button"
          className="avatar-button"
          aria-label={session ? `${displayName} account menu` : "Open account menu"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {session ? (
            <span className="avatar-pill">{avatarText}</span>
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
              <Link className="profile-menu-item" to="/studio" role="menuitem" onClick={() => setMenuOpen(false)}>
                Studio
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
