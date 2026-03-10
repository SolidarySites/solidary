export type SolidaryManifest = {
  protocol_version: "1.0";
  site_id: string;
  site_url: string;
  title: string;
  site_image: string;
  site_image_thumb: string;
  description: string;
};

export type SolidaryManifestSitePathMap = {
  site_url: "solidary.url";
  title: "solidary.title";
  site_image: string;
  site_image_thumb: string;
  description: "solidary.description";
};

export const SOLIDARY_MANIFEST_SITE_PATHS: SolidaryManifestSitePathMap = {
  site_url: "solidary.url",
  title: "solidary.title",
  site_image: "/solidary-media/images/site-image.jpg",
  site_image_thumb: "/solidary-media/images/site-image_thumb.jpg",
  description: "solidary.description"
};
