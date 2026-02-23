import type { Session } from "@supabase/supabase-js";
import type { AstroPageDraft } from "../../../features/site-draft/types";
import { toBase64 } from "../../../lib/base64";
import {
  buildSolidaryFile,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_OG_IMAGE_URL,
  SOLIDARY_MEDIA_IMAGE_ROOT
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
  const slug = computedSlug || `site-${Date.now()}`;
  const imagePath = siteImage
    ? `${SOLIDARY_MEDIA_IMAGE_ROOT}/site-image-${slug}.jpg`
    : DEFAULT_OG_IMAGE_PATH;
  const imageUrl = siteImage ? `/${imagePath.replace(/^public\//, "")}` : DEFAULT_OG_IMAGE_URL;
  const siteImageContentB64 = siteImage ? toBase64(await siteImage.arrayBuffer()) : undefined;

  const provisionedRepo = await provisionGitHubRepository({
    providerToken,
    supabaseAccessToken,
    siteId,
    siteTitle,
    siteDescription,
    slug,
    siteImagePath: siteImage ? imagePath : undefined,
    siteImageContentB64,
    onStep
  });
  onSiteUrlResolved(provisionedRepo.siteUrlResolved);

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
