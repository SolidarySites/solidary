import { describe, expect, it } from "vitest";
import {
  TEMPLATE_SOLIDARY,
  TEMPLATE_SOLIDARY_LINKS
} from "../../../../../templates/site";
import { resolveSiteUrlFromRepo } from "../../../../lib/site-url";
import { buildWellKnownFiles as buildCreateWellKnownFiles } from "./content";
import { buildWellKnownFiles as buildPublishWellKnownFiles } from "../../../studio/routes/site-builder/services/build-files";

describe("well-known file generation", () => {
  it("resolves GitHub Pages URLs for user and project sites", () => {
    expect(
      resolveSiteUrlFromRepo({
        ownerLogin: "jazbogross",
        repoName: "jazbogross.github.io"
      })
    ).toBe("https://jazbogross.github.io");
    expect(
      resolveSiteUrlFromRepo({
        ownerLogin: "jazbogross",
        repoName: "new-site"
      })
    ).toBe("https://jazbogross.github.io/new-site");
  });

  it("uses the same canonical solidary templates for create and publish flows", () => {
    const createResult = buildCreateWellKnownFiles({
      templateSolidary: TEMPLATE_SOLIDARY,
      templateSolidaryLinks: TEMPLATE_SOLIDARY_LINKS,
      siteId: "site-1",
      siteTitle: "Test Site",
      siteDescription: "Description",
      siteUrl: "https://example.com",
      hasSiteImage: true
    });
    const publishResult = buildPublishWellKnownFiles({
      templateSolidary: TEMPLATE_SOLIDARY,
      templateSolidaryLinks: TEMPLATE_SOLIDARY_LINKS,
      siteId: "site-1",
      settingsInput: {
        siteTitle: "Test Site",
        siteDescription: "Description",
        siteUrl: "https://example.com",
        headHtml: "",
        locale: "en-US",
        twitter: true,
        openGraph: true,
        structuredData: true,
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
      },
      hasSiteImage: true
    });

    expect(createResult.solidaryFile).toBe(publishResult.solidaryFile);
    expect(createResult.solidaryLinksFile).toBe(publishResult.solidaryLinksFile);
  });
});
