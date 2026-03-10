import { describe, expect, it } from "vitest";
import { DEFAULT_OG_IMAGE_URL, SITE_IMAGE_PUBLIC_PATH } from "./constants";
import {
  resolveDraftSiteImagePath,
  resolveSettingsOgImagePath
} from "./site-settings-images";

describe("resolveDraftSiteImagePath", () => {
  it("uses the canonical site image path when a new site image is selected", () => {
    expect(
      resolveDraftSiteImagePath({
        siteUrl: "https://example.com/site",
        siteImageSelected: true,
        imageUrl: "blob:https://example.com/123"
      })
    ).toBe(SITE_IMAGE_PUBLIC_PATH);
  });
});

describe("resolveSettingsOgImagePath", () => {
  it("keeps existing OG image paths", () => {
    expect(
      resolveSettingsOgImagePath({
        siteUrl: "https://example.com/site",
        imageUrl: "https://example.com/site/solidary-media/images/og/og-home.jpg"
      })
    ).toBe(DEFAULT_OG_IMAGE_URL);
  });

  it("falls back to the default OG image when given a site image path", () => {
    expect(
      resolveSettingsOgImagePath({
        siteUrl: "https://example.com/site",
        imageUrl: "https://example.com/site/solidary-media/images/site-image.jpg"
      })
    ).toBe(DEFAULT_OG_IMAGE_URL);
  });
});
