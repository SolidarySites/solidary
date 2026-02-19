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

const parseTemplateBoolean = (value: string) => value === "true";

export const site: SiteConfig = {
  name: "{{TITLE}}",
  description: "{{DESCRIPTION}}",
  url: "{{SITE_URL}}",
  seo: {
    ogImage: "{{OG_IMAGE}}",
    robots: "index,follow"
  },
  header: {
    disabled: parseTemplateBoolean("{{HEADER_DISABLED}}"),
    fixed: parseTemplateBoolean("{{HEADER_FIXED}}"),
    brandText: "{{HEADER_BRAND_TEXT}}",
    disableBrand: parseTemplateBoolean("{{HEADER_DISABLE_BRAND}}")
  },
  footer: {
    disabled: parseTemplateBoolean("{{FOOTER_DISABLED}}"),
    fixed: parseTemplateBoolean("{{FOOTER_FIXED}}"),
    modules: JSON.parse("{{FOOTER_MODULES}}")
  }
};
