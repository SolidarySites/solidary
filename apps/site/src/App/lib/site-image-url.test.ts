import { describe, expect, it } from "vitest";
import { normalizeSiteImagePathForStorage } from "./site-image-url";

describe("normalizeSiteImagePathForStorage", () => {
  it("converts absolute site asset URLs to stored relative paths", () => {
    expect(
      normalizeSiteImagePathForStorage({
        siteUrl: "https://jazbogross.github.io/site",
        imageUrl: "https://jazbogross.github.io/site/solidary-media/images/site-image_thumb.jpg"
      })
    ).toBe("/solidary-media/images/site-image_thumb.jpg");
  });

  it("preserves relative asset paths", () => {
    expect(
      normalizeSiteImagePathForStorage({
        siteUrl: "https://jazbogross.github.io/site",
        imageUrl: "/solidary-media/images/site-image.jpg"
      })
    ).toBe("/solidary-media/images/site-image.jpg");
  });
});
