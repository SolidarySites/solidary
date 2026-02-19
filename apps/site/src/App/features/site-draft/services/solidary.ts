export type SolidaryConfig = {
  site_id?: string;
  site_url?: string;
  title?: string;
  image_url?: string;
  description?: string;
};

export const parseSolidaryJson = (raw: string): SolidaryConfig | null => {
  try {
    return JSON.parse(raw) as SolidaryConfig;
  } catch {
    return null;
  }
};
