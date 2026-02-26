import { useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./features/auth/providers/AuthProvider";
import RequireAuth from "./features/auth/components/RequireAuth";
import LandingRoute from "./routes/landing/LandingRoute";
import ExplorerRoute from "./routes/explorer/ExplorerRoute";
import SearchRoute from "./routes/search/SearchRoute";
import StudioRoute from "./routes/studio/StudioRoute";
import SiteCreateRoute from "./routes/site-create/SiteCreateRoute";
import StudioBuilderRoute from "./routes/studio/routes/site-builder/SiteBuilderRoute";
import StudioSettingsRoute from "./routes/studio/routes/site-settings/StudioSettingsRoute";
import ProfileRoute from "./routes/profile/ProfileRoute";
import { useGlobalExternalImageLoading } from "./hooks/useGlobalExternalImageLoading";
import SiteHeader from "./components/SiteHeader";

export default function App() {
  useGlobalExternalImageLoading();
  const headerShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const headerShell = headerShellRef.current;
    if (!headerShell) {
      return;
    }

    const syncHeaderHeight = () => {
      const height = Math.ceil(headerShell.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--site-header-height", `${height}px`);
    };

    syncHeaderHeight();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => syncHeaderHeight());
    resizeObserver?.observe(headerShell);
    window.addEventListener("resize", syncHeaderHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncHeaderHeight);
      document.documentElement.style.removeProperty("--site-header-height");
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-global-header-shell" ref={headerShellRef}>
          <SiteHeader />
        </div>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/explorer" element={<ExplorerRoute />} />
          <Route path="/search" element={<SearchRoute />} />
          <Route
            path="/studio"
            element={
              <RequireAuth>
                <StudioRoute />
              </RequireAuth>
            }
          />
          <Route
            path="/site-create"
            element={
              <RequireAuth>
                <SiteCreateRoute />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
