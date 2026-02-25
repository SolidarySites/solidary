export type SolidaryManifest = {
  protocol_version: "1.0";
  site_id: string;
  site_url: string;
  title: string;
  image_url: string;
  description: string;
};

export type SolidaryManifestSitePathMap = {
  site_url: "solidary.url";
  title: "solidary.title";
  image_url: "solidary.ogImage";
  description: "solidary.description";
};

export const SOLIDARY_MANIFEST_SITE_PATHS: SolidaryManifestSitePathMap = {
  site_url: "solidary.url",
  title: "solidary.title",
  image_url: "solidary.ogImage",
  description: "solidary.description"
};
