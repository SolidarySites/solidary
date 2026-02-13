// src/content/site.ts
export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  seo: {
    ogImage?: string;
    robots: string;
  };
  header: {
    disabled: boolean;
    fixed: boolean;
    brandText: string;
    disableBrand: boolean;
  };
  footer: {
    disabled: boolean;
    fixed: boolean;
    modules: Array<{
      content: string;
      alignment: "left" | "center" | "right";
    }>;
  };
};

export const site: SiteConfig = {
  name: "Solidary Site",
  description: "Solidary Site Description.",
  url: "https://example.com",
  seo: {
    ogImage: "/images/og/og-default.jpg",
    robots: "index,follow"
  },
  header: {
    disabled: false,
    fixed: false,
    brandText: "Solidary",
    disableBrand: false
  },
  footer: {
    disabled: false,
    fixed: false,
    modules: [
      { content: "%copyright%", alignment: "left" },
      { content: "", alignment: "center" },
      { content: "", alignment: "right" }
    ]
  }
};
