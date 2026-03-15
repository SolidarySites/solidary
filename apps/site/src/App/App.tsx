import { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import "./styles/site.css";
import { AuthProvider } from "./features/auth/providers/AuthProvider";
import RequireAuth from "./features/auth/components/RequireAuth";
import { useGlobalExternalImageLoading } from "./hooks/useGlobalExternalImageLoading";
import SiteHeader from "./components/SiteHeader";
import { supabase } from "./lib/supabase";
import { SiteNoticeProvider } from "./features/site-notice/providers/SiteNoticeProvider";

const LandingRoute = lazy(() => import("./routes/landing/LandingRoute"));
const SupportRoute = lazy(() => import("./routes/support/SupportRoute"));
const ContactRoute = lazy(() => import("./routes/contact/ContactRoute"));
const ExplorerRoute = lazy(() => import("./routes/explorer/ExplorerRoute"));
const SearchRoute = lazy(() => import("./routes/search/SearchRoute"));
const StudioRoute = lazy(() => import("./routes/studio/StudioRoute"));
const SiteCreateRoute = lazy(() => import("./routes/site-create/SiteCreateRoute"));
const IndexCreateRoute = lazy(() => import("./routes/index-create/IndexCreateRoute"));
const AdminRoute = lazy(() => import("./routes/admin/AdminRoute"));
const StudioBuilderRoute = lazy(() => import("./routes/studio/routes/site-builder/SiteBuilderRoute"));
const StudioSettingsRoute = lazy(
  () => import("./routes/studio/routes/site-settings/StudioSettingsRoute")
);
const ProfileRoute = lazy(() => import("./routes/profile/ProfileRoute"));

const isStudioEditingPath = (pathname: string) =>
  pathname === "/studio/builder" || pathname === "/studio/settings";

const StudioLockExitGuard = () => {
  const location = useLocation();
  const previousRouteRef = useRef<{ pathname: string; draftId: string | null } | null>(null);

  useEffect(() => {
    const currentDraftId = new URLSearchParams(location.search).get("draftId");
    const previousRoute = previousRouteRef.current;

    if (previousRoute) {
      const previousWasEditing = isStudioEditingPath(previousRoute.pathname);
      const currentIsEditing = isStudioEditingPath(location.pathname);
      const shouldReleasePreviousDraftLocks =
        previousWasEditing &&
        Boolean(previousRoute.draftId) &&
        (!currentIsEditing || previousRoute.draftId !== currentDraftId);

      if (shouldReleasePreviousDraftLocks) {
        void supabase.rpc("site_draft_release_all_section_locks", {
          p_draft_id: previousRoute.draftId
        });
      }
    }

    previousRouteRef.current = {
      pathname: location.pathname,
      draftId: currentDraftId
    };
  }, [location.pathname, location.search]);

  return null;
};

export default function App() {
  useGlobalExternalImageLoading();
  const headerShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const headerShell = headerShellRef.current;
    if (!headerShell) {
      return;
    }

    let animationFrame = 0;
    const syncHeaderVars = () => {
      const rect = headerShell.getBoundingClientRect();
      const height = Math.ceil(rect.height);
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));

      document.documentElement.style.setProperty("--site-header-height", `${height}px`);
      document.documentElement.style.setProperty(
        "--site-header-visible-height",
        `${Math.ceil(visibleHeight)}px`
      );
    };
    const scheduleHeaderVarsSync = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        syncHeaderVars();
      });
    };

    syncHeaderVars();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => scheduleHeaderVarsSync());
    resizeObserver?.observe(headerShell);
    window.addEventListener("resize", scheduleHeaderVarsSync);
    window.addEventListener("scroll", scheduleHeaderVarsSync, { passive: true });

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleHeaderVarsSync);
      window.removeEventListener("scroll", scheduleHeaderVarsSync);
      document.documentElement.style.removeProperty("--site-header-height");
      document.documentElement.style.removeProperty("--site-header-visible-height");
    };
  }, []);

  return (
    <AuthProvider>
      <SiteNoticeProvider>
        <BrowserRouter>
          <div className="app-global-header-shell" ref={headerShellRef}>
            <SiteHeader />
          </div>
          <StudioLockExitGuard />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<LandingRoute />} />
              <Route path="/support" element={<SupportRoute />} />
              <Route path="/contact" element={<ContactRoute />} />
              <Route path="/explorer" element={<ExplorerRoute />} />
              <Route path="/search" element={<SearchRoute />} />
              <Route path="/studio" element={<StudioRoute />} />
              <Route
                path="/site-create"
                element={
                  <RequireAuth>
                    <SiteCreateRoute />
                  </RequireAuth>
                }
              />
              <Route
                path="/index-create"
                element={
                  <RequireAuth>
                    <IndexCreateRoute />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminRoute />
                  </RequireAuth>
                }
              />
              <Route
                path="/studio/builder"
                element={
                  <RequireAuth>
                    <StudioBuilderRoute />
                  </RequireAuth>
                }
              />
              <Route
                path="/studio/settings"
                element={
                  <RequireAuth>
                    <StudioSettingsRoute />
                  </RequireAuth>
                }
              />
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <ProfileRoute />
                  </RequireAuth>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SiteNoticeProvider>
    </AuthProvider>
  );
}
