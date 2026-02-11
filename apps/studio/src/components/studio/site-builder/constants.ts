export const FILE_KEYS = {
  site: "src/content/site.ts",
  tokens: "src/styles/partials/tokens.css",
  header: "src/components/Header.astro",
  footer: "src/components/Footer.astro",
  index: "src/pages/index.astro",
  solidary: "public/.well-known/solidary-links.json"
} as const;

export const PAGE_PATH_PREFIX = "src/content/pages/";
export const PAGE_PATH_SUFFIX = ".md";
