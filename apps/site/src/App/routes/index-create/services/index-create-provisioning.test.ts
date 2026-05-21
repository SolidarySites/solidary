import { beforeEach, describe, expect, it, vi } from "vitest";

const provisioningMocks = vi.hoisted(() => ({
  prepareCreationImage: vi.fn()
}));

vi.mock("../../../lib/supabase", () => ({
  supabaseFunctionUrl: vi.fn(() => "https://example.com/functions/v1/index-create")
}));

vi.mock("../../../services/image-processing/creation-images", () => ({
  prepareCreationImage: provisioningMocks.prepareCreationImage
}));

import { startIndexProvisioning } from "./index-create-provisioning";

describe("startIndexProvisioning", () => {
  beforeEach(() => {
    provisioningMocks.prepareCreationImage.mockReset();
    vi.restoreAllMocks();
  });

  it("uploads optimized index image variants when client optimization succeeds", async () => {
    provisioningMocks.prepareCreationImage.mockResolvedValue({
      mode: "optimized",
      imagesB64: {
        indexImage: "ZnVsbA==",
        indexImageThumb: "dGh1bWI="
      }
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        job: {
          id: "job-1",
          step: "Queued for index creation..."
        }
      })
    } as Response);

    await startIndexProvisioning({
      supabaseAccessToken: "token",
      slug: "child-index",
      title: "Child Index",
      description: "A new child index.",
      organizationId: "org-1",
      ownerUserId: "user-1",
      image: { type: "image/jpeg" } as File
    });

    expect(provisioningMocks.prepareCreationImage).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.image_content_b64).toBe("ZnVsbA==");
    expect(payload.image_thumb_content_b64).toBe("dGh1bWI=");
    expect(payload.image_original_storage_path).toBeUndefined();
  });

  it("sends original storage fallback when client optimization is unavailable", async () => {
    provisioningMocks.prepareCreationImage.mockResolvedValue({
      mode: "server_fallback",
      originalStoragePath: "user-1/create-index/child-index/original.jpg",
      originalMimeType: "image/jpeg"
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        job: {
          id: "job-1",
          step: "Queued for index creation..."
        }
      })
    } as Response);

    await startIndexProvisioning({
      supabaseAccessToken: "token",
      slug: "child-index",
      title: "Child Index",
      description: "A new child index.",
      organizationId: "org-1",
      ownerUserId: "user-1",
      image: { type: "image/jpeg" } as File
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.image_content_b64).toBeUndefined();
    expect(payload.image_thumb_content_b64).toBeUndefined();
    expect(payload.image_original_storage_path).toBe("user-1/create-index/child-index/original.jpg");
    expect(payload.image_original_mime_type).toBe("image/jpeg");
  });
});
