import astroConfigTemplate from "./runtime/astro.config.mjs.txt?raw";
import contentConfigTemplate from "./runtime/content-config.ts.txt?raw";
import solidaryConfigSiteTemplate from "./runtime/solidary-config-site.ts.txt?raw";
import solidaryConfigManifestTemplate from "./runtime/solidary-config-solidary.ts.txt?raw";
import baseLayoutTemplate from "./runtime/layouts-Base.astro.txt?raw";
import headerComponentTemplate from "./runtime/components-Header.astro.txt?raw";
import footerComponentTemplate from "./runtime/components-Footer.astro.txt?raw";
import seoComponentTemplate from "./runtime/components-SEO.astro.txt?raw";
import indexPageTemplate from "./runtime/pages-index.astro.txt?raw";
import slugPageTemplate from "./runtime/pages-slug.astro.txt?raw";

export const RUNTIME_TEMPLATE_FILES: Record<string, string> = {
  "astro.config.mjs": astroConfigTemplate,
  "src/content.config.ts": contentConfigTemplate,
  "src/solidary-config/site.ts": solidaryConfigSiteTemplate,
  "src/solidary-config/solidary.ts": solidaryConfigManifestTemplate,
  "src/layouts/Base.astro": baseLayoutTemplate,
  "src/components/Header.astro": headerComponentTemplate,
  "src/components/Footer.astro": footerComponentTemplate,
  "src/components/SEO.astro": seoComponentTemplate,
  "src/pages/index.astro": indexPageTemplate,
  "src/pages/[slug].astro": slugPageTemplate
};
