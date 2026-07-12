import { supabase } from "../lib/supabase";
import { resolveSiteThumbnailUrl } from "../lib/site-image-url";

export type PublicSite = {
  id: string;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  updatedAt: string | null;
};

type PublicSiteRow = {
  id: string | null;
  title: string | null;
  description: string | null;
  canonical_url: string | null;
  image_url: string | null;
  updated_at: string | null;
};

const normalizeText = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeCanonicalUrl = (value: string | null | undefined) => {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const normalizeUpdatedAt = (value: string | null | undefined) => {
  const trimmed = normalizeText(value);
  return trimmed || null;
};

const getUpdatedAtTimestamp = (value: string | null) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const comparePublicSites = (left: PublicSite, right: PublicSite) => {
  const leftUpdatedAt = getUpdatedAtTimestamp(left.updatedAt);
  const rightUpdatedAt = getUpdatedAtTimestamp(right.updatedAt);
  const updatedAtDifference =
    leftUpdatedAt === rightUpdatedAt ? 0 : rightUpdatedAt > leftUpdatedAt ? 1 : -1;
  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  const titleDifference = left.title.localeCompare(right.title, undefined, {
    sensitivity: "base"
  });
  if (titleDifference !== 0) {
    return titleDifference;
  }

  return left.canonicalUrl.localeCompare(right.canonicalUrl, undefined, {
    sensitivity: "base"
  });
};

const mapPublicSiteRows = (rows: PublicSiteRow[] | null | undefined): PublicSite[] =>
  (rows ?? [])
    .map((row) => {
      const id = normalizeText(row.id);
      const canonicalUrl = normalizeCanonicalUrl(row.canonical_url);
      if (!id || !canonicalUrl) return null;

      const title = normalizeText(row.title) || "Untitled site";
      const description = normalizeText(row.description);
      const fallbackImageUrl = typeof row.image_url === "string" ? row.image_url : "";

      return {
        id,
        title,
        description,
        canonicalUrl,
        imageUrl: resolveSiteThumbnailUrl({ siteUrl: canonicalUrl, fallbackImageUrl }),
        updatedAt: normalizeUpdatedAt(row.updated_at)
      } satisfies PublicSite;
    })
    .filter((site): site is PublicSite => Boolean(site))
    .sort(comparePublicSites);

export const loadPublicSites = async (): Promise<PublicSite[]> => {
  const { data, error } = await supabase
    .from("sites")
    .select("id, title, description, canonical_url, image_url, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapPublicSiteRows((data ?? []) as PublicSiteRow[]);
};
