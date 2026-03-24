import { PublicNetworkSection } from "./components/PublicNetworkSection";
import { useLandingRouteController } from "./hooks/useLandingRouteController";
import "./LandingRoute.css";

export default function LandingRoute() {
  const controller = useLandingRouteController();

  return (
    <div className="app-shell landing-app-shell">
      <main className="main-content landing-main-content">
        <PublicNetworkSection
          sites={controller.sites}
          loading={controller.loading}
          error={controller.error}
        />
      </main>
    </div>
  );
}
