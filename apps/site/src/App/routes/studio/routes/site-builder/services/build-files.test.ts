import { describe, expect, it } from "vitest";
import {
  TEMPLATE_SOLIDARY,
  TEMPLATE_SOLIDARY_LINKS
} from "../../../../../../templates/astro/scaffold";
import { buildFiles } from "./build-files";
import { FILE_KEYS } from "./constants";
import type { BuilderPage, BuilderStyleSettings } from "./types";

const settingsInput = {
  siteTitle: "Test Site",
  siteDescription: "Test Description",
  siteUrl: "https://example.com",
  headHtml: "<meta name=\"theme-color\" content=\"#111111\" />",
  locale: "fr-FR",
  twitter: false,
  openGraph: true,
  structuredData: false,
  indexFollow: true,
  header: {
    disabled: false,
    fixed: false,
    brandText: "Test Site",
    disableBrand: false
  },
  footer: {
    disabled: false,
    fixed: false,
    modules: [
      { content: "%copyright%", alignment: "left" as const },
      { content: "", alignment: "center" as const },
      { content: "", alignment: "right" as const }
    ]
  }
};

const pages: BuilderPage[] = [
  {
    slug: "home",
    title: "Home",
    body: "Hello",
    javascript: "console.log('home')",
    showInNav: true,
    isHome: true
  }
];

const baseStyles: BuilderStyleSettings = {
  tokensCss: ":root { --bg: #fff; }\n",
  styleMode: "simple",
  advancedStructureCss: "",
  baseStructureCss: ".page { color: var(--fg); }\n",
  baseGlobalCss: '@import "./partials/tokens.css";\n@import "./partials/structure.css";\n'
};
const templateSolidary = TEMPLATE_SOLIDARY;
const templateSolidaryLinks = TEMPLATE_SOLIDARY_LINKS;

describe("buildFiles styles output", () => {
  it("writes tokens/global/structure in simple mode with tokens import enabled", () => {
    const files = buildFiles({
      siteId: "site-1",
      ogImageUrl: "/og.jpg",
      settingsInput,
      styles: baseStyles,
      templateSolidary,
      templateSolidaryLinks,
      pages,
      defaultHomeContent: "Default home",
      hasSiteImage: true
    });

    expect(files[FILE_KEYS.tokens]).toContain("--bg");
    expect(files[FILE_KEYS.globalStyles]).toContain('@import "./partials/tokens.css";');
    expect(files[FILE_KEYS.globalStyles]).not.toContain("/* @import");
    expect(files[FILE_KEYS.structureStyles]).toContain(".page");
    expect(files[FILE_KEYS.structureStyles]).toBe(".page { color: var(--fg); }\n");
    expect(files[FILE_KEYS.solidary]).toContain('"site_url": "https://example.com"');
    expect(files[FILE_KEYS.solidary]).toContain('"site_image": "https://example.com/solidary-media/images/site-image.jpg"');
    expect(files[FILE_KEYS.solidary]).toContain(
      '"site_image_thumb": "https://example.com/solidary-media/images/site-image_thumb.jpg"'
    );
    expect(files[FILE_KEYS.solidaryLinks]).toContain('"@type": "site"');
    expect(files[FILE_KEYS.solidaryLinks]).not.toContain('"site_url"');
    expect(files[FILE_KEYS.solidaryLinks]).not.toContain("connection_uuid");
    expect(files[FILE_KEYS.astroConfig]).toContain("const base = (() => {");
    expect(files[FILE_KEYS.seoContent]).toContain('locale: "fr-FR"');
    expect(files[FILE_KEYS.seoContent]).toContain("twitter: false");
    expect(files[FILE_KEYS.seoContent]).toContain("theme-color");
  });

  it("writes advanced structure and disables tokens import in advanced mode", () => {
    const advancedStyles: BuilderStyleSettings = {
      ...baseStyles,
      styleMode: "advanced",
      advancedStructureCss: ":root { --bg: #222; }\n.page { background: var(--bg); }\n"
    };
    const files = buildFiles({
      siteId: "site-1",
      ogImageUrl: "/og.jpg",
      settingsInput,
      styles: advancedStyles,
      templateSolidary,
      templateSolidaryLinks,
      pages,
      defaultHomeContent: "Default home"
    });

    expect(files[FILE_KEYS.globalStyles]).toContain('/* @import "./partials/tokens.css"; */');
    expect(files[FILE_KEYS.structureStyles]).toContain("background: var(--bg)");
    expect(files[FILE_KEYS.structureStyles]).toContain(":root");
    expect(files[FILE_KEYS.tokens]).toContain("--bg");
  });

  it("includes page javascript frontmatter in generated markdown", () => {
    const files = buildFiles({
      siteId: "site-1",
      ogImageUrl: "/og.jpg",
      settingsInput,
      styles: baseStyles,
      templateSolidary,
      templateSolidaryLinks,
      pages,
      defaultHomeContent: "Default home"
    });

    expect(files["src/content/pages/home.md"]).toContain('javascript: "console.log(\'home\')"');
  });
});
