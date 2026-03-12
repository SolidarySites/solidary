import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";

const readConfiguredSiteUrl = () => {
  try {
    const source = readFileSync(new URL("./src/content/solidary.md", import.meta.url), "utf8");
    const frontmatterMatch = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) return "";

    const urlLineMatch = frontmatterMatch[1]?.match(/(?:^|\n)url:\s*(.+)(?:\n|$)/);
    const rawUrlValue = urlLineMatch?.[1]?.trim() ?? "";
    if (!rawUrlValue) return "";

    try {
      const parsed = JSON.parse(rawUrlValue);
      return typeof parsed === "string" ? parsed.trim() : "";
    } catch {
      return rawUrlValue.replace(/^['"]|['"]$/g, "").trim();
    }
  } catch {
    return "";
  }
};

const site = (() => {
  const configuredSiteUrl = readConfiguredSiteUrl();
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).toString().replace(/\/$/, "");
    } catch {
      return configuredSiteUrl;
    }
  }

  const envSiteUrl = process.env.SITE_URL?.trim() ?? "";
  if (!envSiteUrl) return undefined;
  try {
    return new URL(envSiteUrl).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
})();

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
