import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import LandingPage from "./pages/LandingPage";
import StudioPage from "./pages/StudioPage";
import SiteCreatePage from "./pages/SiteCreatePage";
import SiteBuilderPage from "./pages/SiteBuilderPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/site-create" element={<SiteCreatePage />} />
        <Route path="/site-builder" element={<SiteBuilderPage />} />
      </Routes>
    </BrowserRouter>
  );
}
