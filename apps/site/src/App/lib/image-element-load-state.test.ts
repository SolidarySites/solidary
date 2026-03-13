import { describe, expect, it } from "vitest";
import { getImageElementLoadState } from "./image-element-load-state";

describe("getImageElementLoadState", () => {
  it("returns pending when the image is not complete", () => {
    expect(
      getImageElementLoadState({
        complete: false,
        naturalWidth: 1280,
        naturalHeight: 720
      })
    ).toBe("pending");
  });

  it("returns loaded when the image is complete and has positive natural dimensions", () => {
    expect(
      getImageElementLoadState({
        complete: true,
        naturalWidth: 1280,
        naturalHeight: 720
      })
    ).toBe("loaded");
  });

  it("returns error when the image is complete but has no natural dimensions", () => {
    expect(
      getImageElementLoadState({
        complete: true,
        naturalWidth: 0,
        naturalHeight: 0
      })
    ).toBe("error");
  });
});
