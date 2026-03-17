import { describe, expect, it } from "vitest";
import { resolveAuthReturnPath, resolveGitHubPagesBasename } from "./redirect-paths";

describe("resolveGitHubPagesBasename", () => {
  it("uses the repo segment for GitHub Pages project sites", () => {
    expect(
      resolveGitHubPagesBasename({
        hostname: "theatrebuilding.github.io",
        pathname: "/index/studio"
      })
    ).toBe("/index");
  });

  it("does not treat app routes as a basename", () => {
    expect(
      resolveGitHubPagesBasename({
        hostname: "owner.github.io",
        pathname: "/studio"
      })
    ).toBe("");
  });

  it("does not add a basename on custom domains", () => {
    expect(
      resolveGitHubPagesBasename({
        hostname: "example.com",
        pathname: "/index/studio"
      })
    ).toBe("");
  });
});

describe("resolveAuthReturnPath", () => {
  it("prepends the GitHub Pages basename for explicit studio redirects", () => {
    expect(
      resolveAuthReturnPath({
        hostname: "theatrebuilding.github.io",
        currentPathname: "/index/studio",
        requestedReturnToPath: "/studio"
      })
    ).toBe("/index/studio");
  });

  it("keeps already-based paths unchanged", () => {
    expect(
      resolveAuthReturnPath({
        hostname: "theatrebuilding.github.io",
        currentPathname: "/index/studio",
        requestedReturnToPath: "/index/studio"
      })
    ).toBe("/index/studio");
  });

  it("uses the current pathname when no explicit return path is supplied", () => {
    expect(
      resolveAuthReturnPath({
        hostname: "theatrebuilding.github.io",
        currentPathname: "/index/studio"
      })
    ).toBe("/index/studio");
  });
});
