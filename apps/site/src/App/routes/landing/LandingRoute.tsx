import { LandingMasthead } from "./components/LandingMasthead";
import { PublishedSitesSection } from "./components/PublishedSitesSection";
import { useLandingRouteController } from "./hooks/useLandingRouteController";
import "./LandingRoute.css";

export default function LandingRoute() {
  const controller = useLandingRouteController();

  return (
    <div className="app-shell landing-app-shell">
      <main className="main-content landing-main-content">
        <LandingMasthead />
        <PublishedSitesSection
          sites={controller.sites}
          loading={controller.loading}
          error={controller.error}
        />
      </main>
    </div>
  );
}
