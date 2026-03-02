import { describe, expect, it } from "vitest";
import {
  buildPrimaryFontStack,
  buildSecondaryFontStack,
  combineTokensAndStructureCss,
  extractCustomCssFromTokens,
  extractFontFamiliesFromFontsCss,
  setCustomCssInTokens,
  toggleTokensImportInGlobalCss
} from "./style-editor";

const TOKENS = `:root {
  --bg: #fbfbf9;
  --fg: #1a1a1a;
}
`;

describe("style-editor", () => {
  it("parses unique font family names from @font-face blocks", () => {
    const css = `@font-face { font-family: "Inter"; src: url("/fonts/inter.woff2"); }
@font-face { font-family: "IBM Plex Mono"; src: url("/fonts/plex.woff2"); }
@font-face { font-family: "Inter"; src: url("/fonts/inter-italic.woff2"); }
:root { --font-sans: "ShouldNotAppear", sans-serif; }`;
    expect(extractFontFamiliesFromFontsCss(css)).toEqual(["Inter", "IBM Plex Mono"]);
  });

  it("builds primary and secondary stacks with hardcoded fallbacks", () => {
    expect(buildPrimaryFontStack("Inter")).toContain('"Inter", system-ui');
    expect(buildSecondaryFontStack("IBM Plex Mono")).toContain('"IBM Plex Mono", ui-monospace');
  });

  it("extracts and updates custom css block inside tokens.css", () => {
    const withCustom = setCustomCssInTokens(TOKENS, ".header { border-color: var(--fg); }");
    expect(extractCustomCssFromTokens(withCustom)).toContain(".header");
    const withoutCustom = setCustomCssInTokens(withCustom, "");
    expect(extractCustomCssFromTokens(withoutCustom)).toBe("");
    expect(withoutCustom).toContain(":root");
  });

  it("toggles tokens import in global.css", () => {
    const globalCss = '@import "./partials/tokens.css";\n@import "./partials/structure.css";\n';
    const disabled = toggleTokensImportInGlobalCss(globalCss, false);
    expect(disabled).toContain('/* @import "./partials/tokens.css"; */');
    const reenabled = toggleTokensImportInGlobalCss(disabled, true);
    expect(reenabled).toContain('@import "./partials/tokens.css";');
    expect(reenabled).not.toContain("/* @import");
  });

  it("combines tokens and structure css deterministically", () => {
    const combined = combineTokensAndStructureCss(
      ":root { --fg: #111; }\n",
      ".page { color: var(--fg); }\n"
    );
    expect(combined).toContain(":root");
    expect(combined).toContain(".page");
    expect(combined.indexOf(":root")).toBeLessThan(combined.indexOf(".page"));
  });
});
