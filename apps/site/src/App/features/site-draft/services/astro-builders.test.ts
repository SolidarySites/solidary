import { describe, expect, it } from "vitest";
import type { AstroSettings } from "../types";
import {
  buildFooterMarkdown,
  buildHeaderMarkdown,
  buildPageMarkdown,
  buildSeoMarkdown,
  buildSolidaryMarkdown
} from "./astro-builders";

const SETTINGS: AstroSettings = {
  title: "Community Site",
  description: "Shared resources",
  siteUrl: "https://example.com/community",
  ogImage: "/solidary-media/images/og/custom.jpg",
  headHtml: "<meta name=\"theme-color\" content=\"#202020\" />",
  locale: "en-GB",
  twitter: true,
  openGraph: true,
  structuredData: true,
  indexFollow: true,
  header: {
    disabled: false,
    fixed: true,
    brandText: "Community",
    disableBrand: false
  },
  footer: {
    disabled: false,
    fixed: false,
    modules: [
      { content: "%copyright%", alignment: "left" },
      { content: "Docs | https://example.com/docs", alignment: "center" },
      { content: "", alignment: "right" }
    ]
  }
};

describe("astro markdown builders", () => {
  it("builds solidary.md with frontmatter values", () => {
    const output = buildSolidaryMarkdown(SETTINGS);

    expect(output).toContain('title: "Community Site"');
    expect(output).toContain('description: "Shared resources"');
    expect(output).toContain('url: "https://example.com/community"');
    expect(output).toContain('ogImage: "/solidary-media/images/og/custom.jpg"');
  });

  it("builds header.md and footer.md from settings", () => {
    const header = buildHeaderMarkdown(SETTINGS);
    const footer = buildFooterMarkdown(SETTINGS);

    expect(header).toContain("fixed: true");
    expect(header).toContain('brandText: "Community"');
    expect(footer).toContain("modules: [{\"content\":\"%copyright%\",\"alignment\":\"left\"}");
  });

  it("builds seo.md from head html", () => {
    const seo = buildSeoMarkdown(SETTINGS);

    expect(seo).toContain('locale: "en-GB"');
    expect(seo).toContain("twitter: true");
    expect(seo).toContain("openGraph: true");
    expect(seo).toContain("structuredData: true");
    expect(seo).toContain("indexFollow: true");
    expect(seo).toContain("headHtml");
    expect(seo).toContain("theme-color");
  });

  it("builds page markdown with navLabel mirrored from title", () => {
    const output = buildPageMarkdown({
      title: "About Us",
      slug: "about",
      body: "Hello world",
      javascript: "console.log('about')",
      showInNav: true,
      navOrder: 2
    });

    expect(output).toContain('title: "About Us"');
    expect(output).toContain('navLabel: "About Us"');
    expect(output).toContain("navOrder: 2");
    expect(output).toContain('javascript: "console.log(\'about\')"');
    expect(output).toContain("Hello world");
  });
});
