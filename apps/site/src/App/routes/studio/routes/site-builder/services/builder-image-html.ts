const PREVIEW_SPINNER_CLASS = "image-load-spinner-host";

const cleanupClassAttribute = (tag: string, classesToRemove: string[]) =>
  tag.replace(/\sclass=(["'])(.*?)\1/i, (_match, quote: string, value: string) => {
    const nextValue = value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry && !classesToRemove.includes(entry))
      .join(" ");

    return nextValue ? ` class=${quote}${nextValue}${quote}` : "";
  });

const cleanupStyleAttribute = (
  tag: string,
  shouldKeepDeclaration: (name: string, value: string) => boolean
) =>
  tag.replace(/\sstyle=(["'])(.*?)\1/i, (_match, quote: string, value: string) => {
    const nextDeclarations = value
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const colonIndex = entry.indexOf(":");
        if (colonIndex < 0) return null;
        const name = entry.slice(0, colonIndex).trim().toLowerCase();
        const declarationValue = entry.slice(colonIndex + 1).trim();
        if (!name || !declarationValue) return null;
        return shouldKeepDeclaration(name, declarationValue) ? `${name}: ${declarationValue}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));

    return nextDeclarations.length
      ? ` style=${quote}${nextDeclarations.join("; ")}${quote}`
      : "";
  });

const removeAttributePatterns = (tag: string, patterns: string[]) =>
  patterns.reduce(
    (result, pattern) => result.replace(new RegExp(`\\s${pattern}=(["']).*?\\1`, "gi"), ""),
    tag
  );

const sanitizeFigureTag = (tag: string) => {
  const withoutAttributes = removeAttributePatterns(tag, [
    "data-builder-image-figure",
    "data-builder-image-align-wrapper",
    "data-builder-inspectable-element-id",
    "data-external-image-[a-z-]+",
    "data-dynamic-image-[a-z-]+"
  ]);
  const withoutSpinnerClass = cleanupClassAttribute(withoutAttributes, [PREVIEW_SPINNER_CLASS]);
  return cleanupStyleAttribute(withoutSpinnerClass, (name, value) => {
    if (name === "position" && value.toLowerCase() === "relative") return false;
    if (
      name === "--external-image-placeholder-width" ||
      name === "--external-image-placeholder-left" ||
      name === "--external-image-placeholder-height"
    ) {
      return false;
    }
    return true;
  });
};

const sanitizeImageTag = (tag: string) => {
  const withoutAttributes = removeAttributePatterns(tag, [
    "data-builder-image-id",
    "data-builder-image-aspect-ratio",
    "data-builder-inspectable-element-id",
    "data-external-image-[a-z-]+",
    "data-dynamic-image-[a-z-]+"
  ]);
  return cleanupStyleAttribute(withoutAttributes, (name) => name !== "height");
};

const sanitizeFigcaptionTag = (tag: string) =>
  cleanupStyleAttribute(tag, (name) => {
    if (name === "width" || name === "max-width" || name === "margin-left" || name === "display") {
      return false;
    }
    return true;
  });

export const sanitizeBuilderImageHtml = (html: string) => {
  if (
    !html.includes("data-builder-image") &&
    !html.includes("data-image-load-spinner") &&
    !html.includes("data-external-image") &&
    !html.includes("data-dynamic-image")
  ) {
    return html;
  }

  return html
    .replace(/<span\b[^>]*data-image-load-spinner=(["'])true\1[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<figure\b[^>]*>/gi, (tag) => sanitizeFigureTag(tag))
    .replace(/<img\b[^>]*>/gi, (tag) => sanitizeImageTag(tag))
    .replace(/<figcaption\b[^>]*>/gi, (tag) => sanitizeFigcaptionTag(tag))
    .replace(/\sdata-external-image-[a-z-]+=(["']).*?\1/gi, "")
    .replace(/\sdata-dynamic-image-[a-z-]+=(["']).*?\1/gi, "");
};
