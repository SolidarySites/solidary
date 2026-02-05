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
    socials?: {
      x?: string;
      github?: string;
      linkedin?: string;
    };
  };
  seo: {
    ogImage?: string;
    robots: string;
    themeColor: string;
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
    url: "{{AUTHOR_URL}}",
    socials: {
      x: "{{AUTHOR_X}}",
      github: "{{AUTHOR_GITHUB}}",
      linkedin: "{{AUTHOR_LINKEDIN}}"
    }
  },
  seo: {
    ogImage: "{{OG_IMAGE}}",
    robots: "index,follow",
    themeColor: "{{THEME_COLOR}}"
  }
};
