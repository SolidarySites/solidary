import { describe, expect, it } from "vitest";
import type { AstroSettings } from "../types";
import {
  buildFooterMarkdown,
  buildHeaderMarkdown,
  buildPageMarkdown,
  buildSolidaryMarkdown
} from "./astro-builders";

const SETTINGS: AstroSettings = {
  title: "Community Site",
  description: "Shared resources",
  siteUrl: "https://example.com/community",
  ogImage: "/solidary-media/images/og/custom.jpg",
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

  it("builds page markdown with navLabel mirrored from title", () => {
    const output = buildPageMarkdown({
      title: "About Us",
      slug: "about",
      body: "Hello world",
      showInNav: true,
      navOrder: 2
    });

    expect(output).toContain('title: "About Us"');
    expect(output).toContain('navLabel: "About Us"');
    expect(output).toContain("navOrder: 2");
    expect(output).toContain("Hello world");
  });
});
