export const MAX_SITE_DESCRIPTION_LENGTH = 300;

export const clampSiteDescription = (value: string) =>
  value.slice(0, MAX_SITE_DESCRIPTION_LENGTH);
