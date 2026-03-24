import AboutMasthead from "./components/AboutMasthead";
import "../landing/LandingRoute.css";

export default function AboutRoute() {
  return (
    <div className="app-shell landing-app-shell">
      <main className="main-content landing-main-content">
        <AboutMasthead />
      </main>
    </div>
  );
}
