import { beforeEach, describe, expect, it, vi } from "vitest";

const provisioningMocks = vi.hoisted(() => ({
  processImageVariantsFromOriginal: vi.fn()
}));

vi.mock("../../../lib/supabase", () => ({
  supabaseFunctionUrl: vi.fn(() => "https://example.com/functions/v1/index-create")
}));

vi.mock("../../../services/image-processing/picsquish", () => ({
  BYTES_100_KB: 100_000,
  BYTES_1_MB: 1_000_000,
  processImageVariantsFromOriginal: provisioningMocks.processImageVariantsFromOriginal
}));

import { startIndexProvisioning } from "./index-create-provisioning";

describe("startIndexProvisioning", () => {
  beforeEach(() => {
    provisioningMocks.processImageVariantsFromOriginal.mockReset();
    vi.restoreAllMocks();
  });

  it("optimizes and uploads both index image variants", async () => {
    provisioningMocks.processImageVariantsFromOriginal.mockResolvedValue({
      indexImage: new Blob(["full"]),
      indexImageThumb: new Blob(["thumb"])
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
      image: { type: "image/jpeg" } as File
    });

    expect(provisioningMocks.processImageVariantsFromOriginal).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.image_content_b64).toBe("ZnVsbA==");
    expect(payload.image_thumb_content_b64).toBe("dGh1bWI=");
  });
});
