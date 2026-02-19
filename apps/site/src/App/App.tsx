import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./features/auth/providers/AuthProvider";
import RequireAuth from "./features/auth/components/RequireAuth";
import LandingRoute from "./routes/landing/LandingRoute";
import StudioRoute from "./routes/studio/StudioRoute";
import SiteCreateRoute from "./routes/site-create/SiteCreateRoute";
import SiteBuilderRoute from "./routes/site-builder/SiteBuilderRoute";
import ProfileRoute from "./routes/profile/ProfileRoute";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
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
            path="/site-builder"
            element={
              <RequireAuth>
                <SiteBuilderRoute />
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
