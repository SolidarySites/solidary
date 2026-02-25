import type { Session } from "@supabase/supabase-js";
import type { AstroPageDraft } from "../../../features/site-draft/types";
import { toBase64 } from "../../../lib/base64";
import {
  BYTES_100_KB,
  BYTES_1_MB,
  BYTES_500_KB,
  processImageVariantsFromOriginal
} from "../../../services/image-processing/picsquish";
import {
  buildSolidaryFile,
  DEFAULT_OG_IMAGE_PATH,
  resolveAbsoluteAssetUrl,
  SITE_IMAGE_PATH,
  SITE_IMAGE_THUMB_PATH
} from "./provisioning/content";
import { provisionGitHubRepository } from "./provisioning/github-provisioning";
import { saveProvisionedSiteDraft } from "./provisioning/persistence";

type ProvisionSiteDraftParams = {
  session: Session;
  providerToken: string;
  supabaseAccessToken: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  computedSlug: string;
  siteImage: File | null;
  templateSolidary: string;
  tokensCss: string;
  pages: AstroPageDraft[];
  onStep: (value: string) => void;
  onSiteUrlResolved: (value: string) => void;
};

const SITE_CREATE_IMAGE_VARIANTS = [
  {
    key: "siteImage",
    label: "Site image",
    maxBytes: BYTES_1_MB
  },
  {
    key: "siteImageThumb",
    label: "Site thumbnail",
    maxBytes: BYTES_100_KB
  },
  {
    key: "ogImage",
    label: "OG image",
    maxBytes: BYTES_500_KB,
    maxDimensionLimit: 1200
  }
] as const;

export const provisionSiteDraft = async ({
  session,
  providerToken,
  supabaseAccessToken,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  computedSlug,
  siteImage,
  templateSolidary,
  tokensCss,
  pages,
  onStep,
  onSiteUrlResolved
}: ProvisionSiteDraftParams): Promise<string> => {
  if (siteImage && siteImage.type && !siteImage.type.startsWith("image/")) {
    throw new Error("Site image must be an image file.");
  }

  const slug = computedSlug || `site-${Date.now()}`;
  let siteImageContentB64: string | undefined;
  let siteImageThumbContentB64: string | undefined;
  let ogImageContentB64: string | undefined;

  if (siteImage) {
    onStep("Optimizing site images...");
    const processedImages = await processImageVariantsFromOriginal({
      sourceImage: siteImage,
      variants: SITE_CREATE_IMAGE_VARIANTS,
      jpegQuality: 0.9,
      jpegDpi: 72
    });
    siteImageContentB64 = toBase64(await processedImages.siteImage.arrayBuffer());
    siteImageThumbContentB64 = toBase64(await processedImages.siteImageThumb.arrayBuffer());
    ogImageContentB64 = toBase64(await processedImages.ogImage.arrayBuffer());
  }

  const provisionedRepo = await provisionGitHubRepository({
    providerToken,
    supabaseAccessToken,
    siteId,
    siteTitle,
    siteDescription,
    slug,
    siteImagePath: siteImage ? SITE_IMAGE_PATH : undefined,
    siteImageContentB64,
    siteImageThumbPath: siteImage ? SITE_IMAGE_THUMB_PATH : undefined,
    siteImageThumbContentB64,
    ogImagePath: siteImage ? DEFAULT_OG_IMAGE_PATH : undefined,
    ogImageContentB64,
    onStep
  });
  onSiteUrlResolved(provisionedRepo.siteUrlResolved);
  const imageUrl = resolveAbsoluteAssetUrl({
    siteUrl: provisionedRepo.siteUrlResolved,
    assetPath: DEFAULT_OG_IMAGE_PATH
  });

  const solidaryFile = buildSolidaryFile({
    templateSolidary,
    siteId,
    siteTitle,
    siteDescription,
    siteUrl,
    imageUrl,
    urlOverride: provisionedRepo.siteUrlResolved
  });

  onStep("Launching your site...");
  await saveProvisionedSiteDraft({
    session,
    siteId,
    siteTitle,
    siteDescription,
    siteUrl,
    siteUrlResolved: provisionedRepo.siteUrlResolved,
    imageUrl,
    repoFullName: provisionedRepo.repoFullName,
    defaultBranch: provisionedRepo.defaultBranch,
    solidaryFile,
    tokensCss,
    pages
  });

  return siteId;
};
