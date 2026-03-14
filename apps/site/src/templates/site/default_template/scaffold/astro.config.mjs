import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { existsSync, readFileSync } from "node:fs";

const MANAGED_IMAGE_VARIANT_PATTERN =
  /^(?<prefix>.*_[a-f0-9]{10})_(?<variant>small|medium|large|original)(?<extension>\.[^./?#]+)$/i;
const DYNAMIC_IMAGE_MANAGED_ATTR = "data-dynamic-image-managed";
const DYNAMIC_IMAGE_SMALL_ATTR = "data-dynamic-image-src-small";
const DYNAMIC_IMAGE_MEDIUM_ATTR = "data-dynamic-image-src-medium";
const DYNAMIC_IMAGE_LARGE_ATTR = "data-dynamic-image-src-large";
const DYNAMIC_IMAGE_ORIGINAL_ATTR = "data-dynamic-image-src-original";
const DYNAMIC_IMAGE_ATTRIBUTE_PATTERN =
  /\sdata-dynamic-image-(?:managed|src-small|src-medium|src-large|src-original)=["'][^"']*["']/gi;

const parseConfiguredFrontmatterValue = (fieldName) => {
  try {
    const source = readFileSync(new URL("./src/content/solidary.md", import.meta.url), "utf8");
    const frontmatterMatch = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) return null;

    const lineMatch = frontmatterMatch[1]?.match(
      new RegExp(`(?:^|\\n)${fieldName}:\\s*(.+)(?:\\n|$)`)
    );
    const rawValue = lineMatch?.[1]?.trim() ?? "";
    if (!rawValue) return null;

    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue.replace(/^['"]|['"]$/g, "").trim();
    }
  } catch {
    return null;
  }
};

const readConfiguredSiteUrl = () => {
  const parsed = parseConfiguredFrontmatterValue("url");
  return typeof parsed === "string" ? parsed.trim() : "";
};

const readConfiguredSiteFeatures = () => {
  const parsed = parseConfiguredFrontmatterValue("features");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      dynamicImageLoading: true
    };
  }

  return {
    dynamicImageLoading:
      typeof parsed.dynamicImageLoading === "boolean" ? parsed.dynamicImageLoading : true
  };
};

const configuredFeatures = readConfiguredSiteFeatures();

const site = (() => {
  const configuredSiteUrl = readConfiguredSiteUrl();
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).toString().replace(/\/$/, "");
    } catch {
      return configuredSiteUrl;
    }
  }

  const envSiteUrl = process.env.SITE_URL?.trim() ?? "";
  if (!envSiteUrl) return undefined;
  try {
    return new URL(envSiteUrl).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
})();

const base = (() => {
  if (!site) return "/";

  try {
    const pathname = new URL(site).pathname.replace(/\/$/, "");
    return pathname || "/";
  } catch {
    return "/";
  }
})();

const stripConfiguredBaseFromPath = (pathname) => {
  if (!pathname || base === "/") return pathname || "/";
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) {
    const stripped = pathname.slice(base.length);
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }
  return pathname;
};

const createVariantPathname = ({ prefix, variant, extension }) =>
  `${prefix}_${variant}${extension}`;

const formatVariantUrl = ({ rawSource, parsedUrl, pathname }) => {
  const suffix = `${parsedUrl.search}${parsedUrl.hash}`;
  if (/^https?:\/\//i.test(rawSource)) {
    const nextUrl = new URL(rawSource);
    nextUrl.pathname = pathname;
    nextUrl.search = parsedUrl.search;
    nextUrl.hash = parsedUrl.hash;
    return nextUrl.toString();
  }

  if (rawSource.startsWith("//")) {
    return `//${parsedUrl.host}${pathname}${suffix}`;
  }

  return `${pathname}${suffix}`;
};

const resolveManagedImageVariants = (rawSource) => {
  const normalizedSource = typeof rawSource === "string" ? rawSource.trim() : "";
  if (!normalizedSource) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedSource, "https://solidary.local");
  } catch {
    return null;
  }

  const renderedMatch = parsedUrl.pathname.match(MANAGED_IMAGE_VARIANT_PATTERN);
  const publicPathname = stripConfiguredBaseFromPath(parsedUrl.pathname);
  const publicMatch = publicPathname.match(MANAGED_IMAGE_VARIANT_PATTERN);
  if (!renderedMatch?.groups || !publicMatch?.groups) return null;

  const variants = {};
  ["small", "medium", "large", "original"].forEach((variant) => {
    const renderedPathname = createVariantPathname({
      prefix: renderedMatch.groups.prefix,
      variant,
      extension: renderedMatch.groups.extension
    });
    const publicVariantPathname = createVariantPathname({
      prefix: publicMatch.groups.prefix,
      variant,
      extension: publicMatch.groups.extension
    });
    if (!publicVariantPathname.startsWith("/solidary-media/images/pages/")) {
      return;
    }

    if (existsSync(new URL(`./public${publicVariantPathname}`, import.meta.url))) {
      variants[variant] = formatVariantUrl({
        rawSource: normalizedSource,
        parsedUrl,
        pathname: renderedPathname
      });
    }
  });

  return variants.small ? variants : null;
};

const annotateManagedImageTag = (tag, rawSource) => {
  const variants = resolveManagedImageVariants(rawSource);
  if (!variants?.small) return tag;

  const sanitizedTag = tag.replace(DYNAMIC_IMAGE_ATTRIBUTE_PATTERN, "");
  const rewrittenSourceTag = sanitizedTag.replace(
    /(\bsrc\s*=\s*)(["'])([^"']*)(\2)/i,
    (_match, prefix, quote) => `${prefix}${quote}${variants.small}${quote}`
  );
  const attributeText = [
    `${DYNAMIC_IMAGE_MANAGED_ATTR}="true"`,
    `${DYNAMIC_IMAGE_SMALL_ATTR}="${variants.small}"`,
    ...(variants.medium ? [`${DYNAMIC_IMAGE_MEDIUM_ATTR}="${variants.medium}"`] : []),
    ...(variants.large ? [`${DYNAMIC_IMAGE_LARGE_ATTR}="${variants.large}"`] : []),
    ...(variants.original ? [`${DYNAMIC_IMAGE_ORIGINAL_ATTR}="${variants.original}"`] : [])
  ].join(" ");

  return rewrittenSourceTag.replace(/\s*\/?>$/, (closing) => ` ${attributeText}${closing}`);
};

const annotateManagedImagesInRawHtml = (value) =>
  value.replace(/<img\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/gi, (tag, _quote, source) =>
    annotateManagedImageTag(tag, source)
  );

const createDynamicImageRehypePlugin = () => {
  const annotateNode = (node) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "element" && node.tagName === "img") {
      const properties = node.properties ?? {};
      const source = typeof properties.src === "string" ? properties.src.trim() : "";
      const variants = resolveManagedImageVariants(source);

      if (variants?.small) {
        node.properties = {
          ...properties,
          src: variants.small,
          [DYNAMIC_IMAGE_MANAGED_ATTR]: "true",
          [DYNAMIC_IMAGE_SMALL_ATTR]: variants.small,
          ...(variants.medium ? { [DYNAMIC_IMAGE_MEDIUM_ATTR]: variants.medium } : {}),
          ...(variants.large ? { [DYNAMIC_IMAGE_LARGE_ATTR]: variants.large } : {}),
          ...(variants.original ? { [DYNAMIC_IMAGE_ORIGINAL_ATTR]: variants.original } : {})
        };
      }
    }

    if ((node.type === "raw" || node.type === "html") && typeof node.value === "string") {
      node.value = annotateManagedImagesInRawHtml(node.value);
      return;
    }

    if (!Array.isArray(node.children)) return;
    node.children.forEach((child) => annotateNode(child));
  };

  return () => (tree) => {
    annotateNode(tree);
  };
};

export default defineConfig({
  site,
  base,
  output: "static",
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: configuredFeatures.dynamicImageLoading ? [createDynamicImageRehypePlugin()] : []
  }
});
