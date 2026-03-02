import { describe, expect, it } from "vitest";
import { buildDraftPageRows, buildDraftSaveSignature } from "./draft-utils";
import type { BuilderPage, BuilderStyleSettings, DraftImageAsset } from "./types";

const pages: BuilderPage[] = [
  {
    slug: "home",
    title: "Home",
    body: "<p>Hello</p>",
    javascript: "console.log('home')",
    showInNav: true,
    isHome: true
  }
];

const draftImages: DraftImageAsset[] = [];

const styleSettings: BuilderStyleSettings = {
  tokensCss: ":root { --bg: #fff; }\n",
  styleMode: "simple",
  advancedStructureCss: "",
  baseStructureCss: ".page { color: var(--fg); }\n",
  baseGlobalCss: '@import "./partials/tokens.css";\n@import "./partials/structure.css";\n'
};

describe("draft-utils page javascript", () => {
  it("includes javascript in draft page rows", () => {
    const rows = buildDraftPageRows("draft-1", pages, draftImages);
    expect(rows).toHaveLength(1);
    expect(rows[0].javascript).toBe("console.log('home')");
  });

  it("includes javascript in draft save signatures", () => {
    const signature = buildDraftSaveSignature({
      draftId: "draft-1",
      settingsInput: {
        siteTitle: "Site",
        siteDescription: "Description",
        siteUrl: "https://example.com",
        header: {
          disabled: false,
          fixed: false,
          brandText: "Site",
          disableBrand: false
        },
        footer: {
          disabled: false,
          fixed: false,
          modules: [
            { content: "%copyright%", alignment: "left" },
            { content: "", alignment: "center" },
            { content: "", alignment: "right" }
          ]
        }
      },
      imageUrl: "/og.jpg",
      styles: styleSettings,
      pagesSnapshot: pages,
      draftImages
    });

    expect(signature).toContain("\"javascript\":\"console.log('home')\"");
  });
});
