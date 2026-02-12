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
    disableCopyright: boolean;
    copyrightName: string;
    customText: string;
    customLinks: Array<{
      label: string;
      url: string;
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
    disableCopyright: parseTemplateBoolean("{{FOOTER_DISABLE_COPYRIGHT}}"),
    copyrightName: "{{FOOTER_COPYRIGHT_NAME}}",
    customText: "{{FOOTER_CUSTOM_TEXT}}",
    customLinks: JSON.parse("{{FOOTER_CUSTOM_LINKS}}")
  }
};
