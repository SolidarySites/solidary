import { describe, expect, it } from "vitest";
import {
  SITE_ASSET_FULL_IMAGE_THRESHOLD_PX,
  shouldLoadFullSiteAssetImage
} from "./site-asset-image";

describe("shouldLoadFullSiteAssetImage", () => {
  it("keeps thumbnail-only mode when both rendered dimensions stay at or below the threshold", () => {
    expect(
      shouldLoadFullSiteAssetImage({
        width: SITE_ASSET_FULL_IMAGE_THRESHOLD_PX,
        height: SITE_ASSET_FULL_IMAGE_THRESHOLD_PX
      })
    ).toBe(false);
  });

  it("switches to the full image when width exceeds the threshold", () => {
    expect(
      shouldLoadFullSiteAssetImage({
        width: SITE_ASSET_FULL_IMAGE_THRESHOLD_PX + 1,
        height: 120
      })
    ).toBe(true);
  });

  it("switches to the full image when height exceeds the threshold", () => {
    expect(
      shouldLoadFullSiteAssetImage({
        width: 120,
        height: SITE_ASSET_FULL_IMAGE_THRESHOLD_PX + 1
      })
    ).toBe(true);
  });
});
