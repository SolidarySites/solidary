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
  name: "{{TITLE}}",
  tagline: "{{TAGLINE}}",
  description: "{{DESCRIPTION}}",
  url: "{{SITE_URL}}",
  locale: "{{LOCALE}}",
  author: {
    name: "{{AUTHOR_NAME}}",
    email: "{{AUTHOR_EMAIL}}",
    url: "{{AUTHOR_URL}}"
  },
  seo: {
    ogImage: "{{OG_IMAGE}}",
    robots: "index,follow"
  }
};
