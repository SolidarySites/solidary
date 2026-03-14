import { useCallback, useMemo, useState, type SetStateAction } from "react";
import { DEFAULT_SEO_SETTINGS } from "../../../../../../features/site-draft/seo";
import { DEFAULT_ASTRO_SITE_FEATURES } from "../../../../../../features/site-draft/types";
import { clampSiteDescription } from "../../../../../../services/site-metadata";
import {
  DEFAULT_OG_IMAGE_URL,
  SITE_IMAGE_PUBLIC_PATH
} from "../../services/constants";
import {
  DEFAULT_FOOTER_MODULES,
  normalizeFooterModules
} from "../../services/draft-utils";
import type {
  BuilderPage,
  DraftImageAsset,
  FooterModule
} from "../../services/types";

export const useBuilderDocumentState = () => {
  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteDescription, setSiteDescriptionState] = useState(
    "Describe your site in a sentence or two."
  );
  const [siteUrl, setSiteUrl] = useState("");
  const [dynamicImageLoadingEnabled, setDynamicImageLoadingEnabled] = useState(
    DEFAULT_ASTRO_SITE_FEATURES.dynamicImageLoading
  );

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [draftImages, setDraftImages] = useState<DraftImageAsset[]>([]);
  const [draftPageSlugs, setDraftPageSlugs] = useState<string[]>([]);
  const [activePreviewSlug, setActivePreviewSlug] = useState("home");

  const [headerDisabled, setHeaderDisabled] = useState(false);
  const [headerFixed, setHeaderFixed] = useState(false);
  const [headerBrandText, setHeaderBrandText] = useState("New Astro Site");
  const [headerBrandDisabled, setHeaderBrandDisabled] = useState(false);

  const [footerDisabled, setFooterDisabled] = useState(false);
  const [footerFixed, setFooterFixed] = useState(false);
  const [footerModules, setFooterModules] = useState<FooterModule[]>(
    normalizeFooterModules(DEFAULT_FOOTER_MODULES)
  );

  const [headHtml, setHeadHtml] = useState("");
  const [seoLocale, setSeoLocale] = useState<string>(DEFAULT_SEO_SETTINGS.locale);
  const [seoTwitter, setSeoTwitter] = useState<boolean>(DEFAULT_SEO_SETTINGS.twitter);
  const [seoOpenGraph, setSeoOpenGraph] = useState<boolean>(DEFAULT_SEO_SETTINGS.openGraph);
  const [seoStructuredData, setSeoStructuredData] = useState<boolean>(
    DEFAULT_SEO_SETTINGS.structuredData
  );
  const [seoIndexFollow, setSeoIndexFollow] = useState<boolean>(DEFAULT_SEO_SETTINGS.indexFollow);

  const siteSettingsInput = useMemo(
    () => ({
      siteTitle,
      siteDescription,
      siteUrl,
      features: {
        dynamicImageLoading: dynamicImageLoadingEnabled
      },
      headHtml,
      locale: seoLocale,
      twitter: seoTwitter,
      openGraph: seoOpenGraph,
      structuredData: seoStructuredData,
      indexFollow: seoIndexFollow,
      header: {
        disabled: headerDisabled,
        fixed: headerFixed,
        brandText: headerBrandText,
        disableBrand: headerBrandDisabled
      },
      footer: {
        disabled: footerDisabled,
        fixed: footerFixed,
        modules: normalizeFooterModules(footerModules)
      }
    }),
    [
      footerDisabled,
      footerFixed,
      footerModules,
      headHtml,
      headerBrandDisabled,
      headerBrandText,
      headerDisabled,
      headerFixed,
      seoIndexFollow,
      seoLocale,
      seoOpenGraph,
      seoStructuredData,
      seoTwitter,
      siteDescription,
      siteTitle,
      siteUrl,
      dynamicImageLoadingEnabled
    ]
  );

  const draftSaveImageUrl = useMemo(() => {
    if (siteImage) return SITE_IMAGE_PUBLIC_PATH;
    return siteImagePreview || draftImageUrl || DEFAULT_OG_IMAGE_URL;
  }, [draftImageUrl, siteImage, siteImagePreview]);

  const setSiteDescription = useCallback((value: SetStateAction<string>) => {
    setSiteDescriptionState((current) =>
      clampSiteDescription(typeof value === "function" ? value(current) : value)
    );
  }, []);

  return {
    siteTitle,
    setSiteTitle,
    siteDescription,
    setSiteDescription,
    siteUrl,
    setSiteUrl,
    dynamicImageLoadingEnabled,
    setDynamicImageLoadingEnabled,
    siteImage,
    setSiteImage,
    siteImagePreview,
    setSiteImagePreview,
    draftImageUrl,
    setDraftImageUrl,
    pages,
    setPages,
    draftImages,
    setDraftImages,
    draftPageSlugs,
    setDraftPageSlugs,
    activePreviewSlug,
    setActivePreviewSlug,
    headerDisabled,
    setHeaderDisabled,
    headerFixed,
    setHeaderFixed,
    headerBrandText,
    setHeaderBrandText,
    headerBrandDisabled,
    setHeaderBrandDisabled,
    footerDisabled,
    setFooterDisabled,
    footerFixed,
    setFooterFixed,
    footerModules,
    setFooterModules,
    headHtml,
    setHeadHtml,
    seoLocale,
    setSeoLocale,
    seoTwitter,
    setSeoTwitter,
    seoOpenGraph,
    setSeoOpenGraph,
    seoStructuredData,
    setSeoStructuredData,
    seoIndexFollow,
    setSeoIndexFollow,
    siteSettingsInput,
    draftSaveImageUrl
  };
};
