import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import LandingRoute from "./routes/landing/LandingRoute";
import StudioRoute from "./routes/studio/StudioRoute";
import SiteCreateRoute from "./routes/site-create/SiteCreateRoute";
import SiteBuilderRoute from "./routes/site-builder/SiteBuilderRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/studio" element={<StudioRoute />} />
        <Route path="/site-create" element={<SiteCreateRoute />} />
        <Route path="/site-builder" element={<SiteBuilderRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
