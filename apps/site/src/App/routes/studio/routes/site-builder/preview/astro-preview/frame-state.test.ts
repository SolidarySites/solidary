import { describe, expect, it, vi } from "vitest";

vi.mock("./image-source-utils", () => ({
  mapHtmlImageSources: (html: string) => html
}));

import { buildPreviewFrameState } from "./frame-state";

describe("buildPreviewFrameState", () => {
  it("derives nav items, active page, and footer html for the preview frame", () => {
    const state = buildPreviewFrameState({
      editable: true,
      previewBrand: "Solidary",
      pages: [
        {
          title: "Home",
          slug: "home",
          body: "Hello world",
          isHome: true,
          showInNav: true
        },
        {
          title: "About",
          slug: "about",
          body: "About body",
          showInNav: true
        }
      ],
      draftImages: [],
      repoFontsCss: "",
      tokensCss: ":root { --color: red; }",
      styleMode: "simple",
      advancedStructureCss: "",
      previewStylesCss: ".hero { color: red; }",
      dynamicImageLoadingEnabled: false,
      homeFallbackBody: "Fallback",
      activePageSlug: "about",
      publishedSiteBaseUrl: null,
      previewAssetBaseUrl: null,
      header: {
        disabled: false,
        fixed: false,
        brandText: "Solidary",
        disableBrand: false
      },
      footer: {
        disabled: false,
        fixed: false,
        modules: [
          {
            alignment: "left",
            content: "Docs|https://example.com"
          }
        ]
      }
    });

    expect(state.activeSlug).toBe("about");
    expect(state.navItems).toHaveLength(2);
    expect(state.activeBodyHtml).toContain("About body");
    expect(state.footer.modules[0]?.hidden).toBe(false);
    expect(state.footer.modules[0]?.html).toContain("https://example.com");
  });
});
