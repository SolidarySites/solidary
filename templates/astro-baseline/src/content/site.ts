// src/content/site.ts
export type SiteConfig = {
  name: string;
  tagline: string;
  description: string;
  url: string;            
  locale: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  seo: {
    ogImage?: string;
    robots: string;
  };
};

export const site: SiteConfig = {
  name: "Astro Baseline",
  tagline: "A boring, production-ready Astro starter.",
  description:
    "Astro Baseline is a minimal HTML-first starter with senior defaults: SEO, JSON-LD, a11y basics, and clean structure.",
  url: import.meta.env.SITE_URL ?? "https://example.com",
  locale: "en",
  author: {
    name: "Your Name",
    email: "hello@example.com",
    url: "https://example.com"
  },
  seo: {
    ogImage: "/images/og/og-default.jpg",
    robots: "index,follow"
  }
};
