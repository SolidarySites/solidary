import sanitizeFilenameLib from "sanitize-filename";

export type SanitizeFilenameOptions = {
  fallback?: string;
  stripExtension?: boolean;
  stripPattern?: RegExp;
  lowercase?: boolean;
  spaces?: "underscore" | "hyphen" | "preserve";
};

const collapseSeparators = (value: string) =>
  value.replace(/_+/g, "_").replace(/-+/g, "-").replace(/^[_-]+|[_-]+$/g, "");

export const sanitizeFilename = (value: string, options: SanitizeFilenameOptions = {}) => {
  const {
    fallback = "file",
    stripExtension = false,
    stripPattern,
    lowercase = false,
    spaces = "preserve"
  } = options;

  let next = value.trim();
  if (stripExtension) {
    next = next.replace(/\.[^/.]+$/, "");
  }
  if (stripPattern) {
    next = next.replace(stripPattern, "");
  }
  if (lowercase) {
    next = next.toLowerCase();
  }
  if (spaces === "underscore") {
    next = next.replace(/\s+/g, "_");
  } else if (spaces === "hyphen") {
    next = next.replace(/\s+/g, "-");
  }

  next = sanitizeFilenameLib(next);

  if (spaces === "underscore") {
    next = next.replace(/\s+/g, "_");
  } else if (spaces === "hyphen") {
    next = next.replace(/\s+/g, "-");
  }

  const normalized = collapseSeparators(next);
  return normalized || fallback;
};

