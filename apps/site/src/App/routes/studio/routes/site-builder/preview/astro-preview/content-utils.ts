import type { FooterSegment } from "./types";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const formatInlineMarkdown = (value: string) =>
  escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;

export const markdownToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (htmlTagPattern.test(trimmed)) return trimmed;

  const lines = trimmed.replace(/\r/g, "").split("\n");
  const chunks: string[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    chunks.push(`<p>${paragraphBuffer.map(formatInlineMarkdown).join("<br />")}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    chunks.push(`<ul>${listBuffer.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ul>`);
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (codeBuffer) {
      if (line.startsWith("```")) {
        chunks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = null;
      } else {
        codeBuffer.push(rawLine);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      codeBuffer = [];
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3);
      const tag = `h${level}`;
      chunks.push(`<${tag}>${formatInlineMarkdown(heading[2].trim())}</${tag}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listBuffer.push(listItem[1].trim());
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (listBuffer.length) flushList();
    paragraphBuffer.push(line.trim());
  }

  if (codeBuffer) {
    chunks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();

  return chunks.join("\n");
};

export const normalizeSitePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export const normalizePublishedBaseUrl = (value: string | null) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
};

export const toPublishedUrl = (baseUrl: string, sitePath: string) => {
  if (!baseUrl) return sitePath;
  return `${baseUrl}${normalizeSitePath(sitePath)}`;
};

const footerMarkdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const footerBareUrlPattern = /https?:\/\/[^\s)]+/;
const footerPipeLinkPattern = /^\s*([^|\n]+?)\s*\|\s*(https?:\/\/[^\s)]+)\s*$/;

export const parseFooterLineSegments = (line: string): FooterSegment[] => {
  const raw = line ?? "";
  if (!raw) return [{ type: "text", text: "" }];

  const pipeMatch = raw.match(footerPipeLinkPattern);
  if (pipeMatch) {
    const label = pipeMatch[1].trim();
    const href = pipeMatch[2].trim();
    return [
      {
        type: "link",
        text: label || href,
        href
      }
    ];
  }

  const segments: FooterSegment[] = [];
  let remaining = raw;

  while (remaining.length) {
    const markdownMatch = remaining.match(footerMarkdownLinkPattern);
    const bareMatch = remaining.match(footerBareUrlPattern);

    const markdownIndex = markdownMatch?.index ?? -1;
    const bareIndex = bareMatch?.index ?? -1;

    let useMarkdown = false;
    let nextIndex = -1;

    if (markdownIndex >= 0 && (bareIndex < 0 || markdownIndex <= bareIndex)) {
      useMarkdown = true;
      nextIndex = markdownIndex;
    } else if (bareIndex >= 0) {
      nextIndex = bareIndex;
    }

    if (nextIndex < 0) {
      if (remaining) {
        segments.push({ type: "text", text: remaining });
      }
      break;
    }

    if (nextIndex > 0) {
      segments.push({ type: "text", text: remaining.slice(0, nextIndex) });
    }

    if (useMarkdown && markdownMatch) {
      const [fullMatch, label, href] = markdownMatch;
      segments.push({
        type: "link",
        text: (label || href || "").trim() || (href || ""),
        href: href?.trim() || ""
      });
      remaining = remaining.slice(nextIndex + fullMatch.length);
      continue;
    }

    if (!useMarkdown && bareMatch) {
      const href = bareMatch[0];
      segments.push({ type: "link", text: href, href });
      remaining = remaining.slice(nextIndex + href.length);
      continue;
    }

    break;
  }

  return segments.length ? segments : [{ type: "text", text: raw }];
};
