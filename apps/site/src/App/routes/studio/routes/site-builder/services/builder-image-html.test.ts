import { describe, expect, it } from "vitest";
import { sanitizeBuilderImageHtml } from "./builder-image-html";

describe("sanitizeBuilderImageHtml", () => {
  it("removes preview-only spinner, ids, placeholder sizing, and forced image height", () => {
    const input = `
      <figure data-builder-image-figure="true" class="image-load-spinner-host hero" style="display:block; max-width:100%; margin:0; position:relative; --external-image-placeholder-width: 852px; --external-image-placeholder-left: 0px; --external-image-placeholder-height: 1065px;">
        <img
          src="/solidary-media/images/pages/example_large.jpg"
          data-builder-image-id="img-1"
          data-builder-image-aspect-ratio="0.8"
          style="display:inline-block; max-width:100%; width:65%; height:1065px;"
        />
        <figcaption style="text-align:left; width:852px; max-width:100%; margin-left:0; display:block;">Caption</figcaption>
        <span data-image-load-spinner="true" class="image-load-spinner-overlay"><svg></svg></span>
      </figure>
    `;

    const output = sanitizeBuilderImageHtml(input);

    expect(output).not.toContain("data-builder-image-figure");
    expect(output).not.toContain("data-builder-image-id");
    expect(output).not.toContain("data-builder-image-aspect-ratio");
    expect(output).not.toContain("data-image-load-spinner");
    expect(output).not.toContain("image-load-spinner-host");
    expect(output).not.toContain("--external-image-placeholder-width");
    expect(output).not.toContain("position: relative");
    expect(output).not.toContain("height: 1065px");
    expect(output).toContain('class="hero"');
    expect(output).toContain("width: 65%");
    expect(output).toContain("text-align: left");
    expect(output).not.toContain("width: 852px");
  });
});
