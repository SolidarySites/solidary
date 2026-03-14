import astroConfigTemplate from "./scaffold/astro.config.mjs?raw";
import footerComponentTemplate from "./scaffold/src/components/Footer.astro?raw";
import headerComponentTemplate from "./scaffold/src/components/Header.astro?raw";
import seoComponentTemplate from "./scaffold/src/components/SEO.astro?raw";
import dynamicImageLoaderComponentTemplate from "./scaffold/src/components/DynamicImageLoader.astro?raw";
import baseLayoutTemplate from "./scaffold/src/layouts/Base.astro?raw";
import indexPageTemplate from "./scaffold/src/pages/index.astro?raw";
import slugPageTemplate from "./scaffold/src/pages/[slug].astro?raw";
import contentConfigTemplate from "./runtime/content-config.ts.txt?raw";
import robotsPageTemplate from "./runtime/robots.txt.ts.txt?raw";
import solidaryConfigSiteTemplate from "./runtime/solidary-config-site.ts.txt?raw";
import solidaryConfigManifestTemplate from "./runtime/solidary-config-solidary.ts.txt?raw";

export const RUNTIME_TEMPLATE_FILES: Record<string, string> = {
  "astro.config.mjs": astroConfigTemplate,
  "src/content.config.ts": contentConfigTemplate,
  "src/solidary-config/site.ts": solidaryConfigSiteTemplate,
  "src/solidary-config/solidary.ts": solidaryConfigManifestTemplate,
  "src/layouts/Base.astro": baseLayoutTemplate,
  "src/components/DynamicImageLoader.astro": dynamicImageLoaderComponentTemplate,
  "src/components/Header.astro": headerComponentTemplate,
  "src/components/Footer.astro": footerComponentTemplate,
  "src/components/SEO.astro": seoComponentTemplate,
  "src/pages/index.astro": indexPageTemplate,
  "src/pages/[slug].astro": slugPageTemplate,
  "src/pages/robots.txt.ts": robotsPageTemplate
};
