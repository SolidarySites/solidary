import { beforeEach, describe, expect, it, vi } from "vitest";

const imageMocks = vi.hoisted(() => ({
  processImageVariantsFromOriginal: vi.fn(),
  upload: vi.fn(),
  from: vi.fn()
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    storage: {
      from: imageMocks.from
    }
  }
}));

vi.mock("./picsquish", () => ({
  processImageVariantsFromOriginal: imageMocks.processImageVariantsFromOriginal
}));

import { MAX_CREATION_IMAGE_BYTES, prepareCreationImage } from "./creation-images";

const makeFile = (parts: BlobPart[], name = "image.jpg", type = "image/jpeg") =>
  new File(parts, name, { type });

const stubClientOptimizationSupport = () => {
  vi.stubGlobal("createImageBitmap", vi.fn());
  vi.stubGlobal("Worker", class Worker {});
  vi.stubGlobal("OffscreenCanvas", class OffscreenCanvas {});
  vi.stubGlobal(
    "HTMLCanvasElement",
    class HTMLCanvasElement {
      toBlob() {
        // Capability probe only.
      }
    }
  );
};

const stubNoClientOptimizationSupport = () => {
  vi.stubGlobal("createImageBitmap", undefined);
  vi.stubGlobal("Worker", undefined);
  vi.stubGlobal("OffscreenCanvas", undefined);
  vi.stubGlobal("HTMLCanvasElement", undefined);
};

describe("prepareCreationImage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    imageMocks.processImageVariantsFromOriginal.mockReset();
    imageMocks.upload.mockReset();
    imageMocks.from.mockReset();
    imageMocks.from.mockReturnValue({ upload: imageMocks.upload });
    imageMocks.upload.mockResolvedValue({ error: null });
  });

  it("returns optimized base64 variants when browser optimization succeeds", async () => {
    stubClientOptimizationSupport();
    imageMocks.processImageVariantsFromOriginal.mockResolvedValue({
      main: new Blob(["main"]),
      thumb: new Blob(["thumb"])
    });

    const result = await prepareCreationImage({
      file: makeFile(["original"]),
      ownerUserId: "user-1",
      stagingFolder: "create-site",
      stagingId: "site-1",
      variants: [
        { key: "main", label: "Main", maxBytes: 1024 },
        { key: "thumb", label: "Thumb", maxBytes: 1024 }
      ]
    });

    expect(result).toEqual({
      mode: "optimized",
      imagesB64: {
        main: "bWFpbg==",
        thumb: "dGh1bWI="
      }
    });
    expect(imageMocks.upload).not.toHaveBeenCalled();
  });

  it("uploads the original for server fallback when browser optimization is unsupported", async () => {
    stubNoClientOptimizationSupport();

    const result = await prepareCreationImage({
      file: makeFile(["original"]),
      ownerUserId: "user-1",
      stagingFolder: "create-index",
      stagingId: "index-1",
      variants: [{ key: "main", label: "Main", maxBytes: 1024 }]
    });

    expect(result).toEqual({
      mode: "server_fallback",
      originalStoragePath: "user-1/create-index/index-1/original.jpg",
      originalMimeType: "image/jpeg"
    });
    expect(imageMocks.from).toHaveBeenCalledWith("site-draft-images");
    expect(imageMocks.upload).toHaveBeenCalledWith(
      "user-1/create-index/index-1/original.jpg",
      expect.any(File),
      expect.objectContaining({ contentType: "image/jpeg", upsert: true })
    );
  });

  it("rejects images larger than the creation upload limit", async () => {
    await expect(
      prepareCreationImage({
        file: makeFile([new Uint8Array(MAX_CREATION_IMAGE_BYTES + 1)]),
        ownerUserId: "user-1",
        stagingFolder: "create-site",
        stagingId: "site-1",
        variants: [{ key: "main", label: "Main", maxBytes: 1024 }]
      })
    ).rejects.toThrow("Image is too large");
    expect(imageMocks.upload).not.toHaveBeenCalled();
  });
});
