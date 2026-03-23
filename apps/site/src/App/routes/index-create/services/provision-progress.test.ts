import { describe, expect, it } from "vitest";
import {
  getIndexProvisionProgress,
  INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
} from "./provision-progress";

describe("getIndexProvisionProgress", () => {
  it("starts the progress bar when client-side image optimization is running", () => {
    const progress = getIndexProvisionProgress("Optimizing index image...");

    expect(progress.segmentCount).toBe(INDEX_PROVISION_PROGRESS_SEGMENT_COUNT);
    expect(progress.percent).toBe(0);
    expect(progress.percent).toBeLessThan(15);
  });

  it("starts at zero when no step is available", () => {
    expect(getIndexProvisionProgress("")).toEqual({
      percent: 0,
      segmentCount: INDEX_PROVISION_PROGRESS_SEGMENT_COUNT
    });
  });

  it("maps known provisioning stages onto the segmented progress scale", () => {
    const progress = getIndexProvisionProgress("Creating Supabase project...");

    expect(progress.segmentCount).toBe(INDEX_PROVISION_PROGRESS_SEGMENT_COUNT);
    expect(progress.percent).toBeGreaterThan(50);
    expect(progress.percent).toBeLessThan(70);
  });

  it("uses the repository file subprogress when available", () => {
    const progress = getIndexProvisionProgress("Creating repository files (50%)...");

    expect(progress.percent).toBeGreaterThan(70);
    expect(progress.percent).toBeLessThan(85);
  });

  it("reaches one hundred percent on completion", () => {
    expect(getIndexProvisionProgress("Index provisioning completed.").percent).toBe(100);
  });
});
