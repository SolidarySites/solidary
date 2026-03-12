export const MAX_SITE_TITLE_LENGTH = 50;
export const MAX_SITE_DESCRIPTION_LENGTH = 300;

export const clampSiteTitle = (value: string) =>
  value.slice(0, MAX_SITE_TITLE_LENGTH);

export const normalizeSiteTitle = (value: string) =>
  clampSiteTitle(value).trim();

export const clampSiteDescription = (value: string) =>
  value.slice(0, MAX_SITE_DESCRIPTION_LENGTH);
