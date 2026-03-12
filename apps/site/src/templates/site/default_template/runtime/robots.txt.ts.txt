import type { APIRoute } from "astro";
import solidaryContent from "../content/solidary.md";
import { parseSolidaryFrontmatter } from "../solidary-config/site";

type MarkdownModule = { frontmatter?: Record<string, unknown> };

export const GET: APIRoute = () => {
  const solidary = parseSolidaryFrontmatter((solidaryContent as MarkdownModule).frontmatter);
  const site = solidary.url.trim().replace(/\/+$/, "");
  const sitemapLine = site ? `Sitemap: ${site}/sitemap-index.xml\n` : "";
  const body = `User-agent: *
Allow: /

${sitemapLine}`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
