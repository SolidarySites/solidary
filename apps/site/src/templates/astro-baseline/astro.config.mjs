import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const site = process.env.SITE_URL;

const base = (() => {
  if (!site) return "/";

  try {
    const pathname = new URL(site).pathname.replace(/\/$/, "");
    return pathname || "/";
  } catch {
    return "/";
  }
})();

export default defineConfig({
  site,
  base,
  output: "static",
  integrations: [sitemap()],
});
