export const FILE_KEYS = {
  astroConfig: "astro.config.mjs",
  solidaryContent: "src/content/solidary.md",
  headerContent: "src/content/header.md",
  footerContent: "src/content/footer.md",
  seoContent: "src/content/seo.md",
  tokens: "src/styles/partials/tokens.css",
  globalStyles: "src/styles/global.css",
  structureStyles: "src/styles/partials/structure.css",
  solidary: "public/.well-known/solidary.json",
  solidaryLinks: "public/.well-known/solidary-links.json"
} as const;

export const SOLIDARY_MEDIA_IMAGES_BASE_PATH = "/solidary-media/images";
export const SITE_IMAGE_PUBLIC_PATH = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/site-image.jpg`;
export const SITE_IMAGE_THUMB_PUBLIC_PATH = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/site-image_thumb.jpg`;
export const DEFAULT_OG_IMAGE_URL = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/og/og-home.jpg`;

export const TEMPLATE_RUNTIME_FILE_PATHS = [
  "astro.config.mjs",
  "src/content.config.ts",
  "src/solidary-config/site.ts",
  "src/solidary-config/solidary.ts",
  "src/layouts/Base.astro",
  "src/components/Header.astro",
  "src/components/Footer.astro",
  "src/components/SEO.astro",
  "src/pages/index.astro",
  "src/pages/[slug].astro"
] as const;

export const PAGE_PATH_PREFIX = "src/content/pages/";
export const PAGE_PATH_SUFFIX = ".md";
