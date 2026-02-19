import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import templateSolidary from "../../../../templates/astro/solidary-links.json?raw";
import tokensTemplate from "../../../../templates/astro/tokens.css?raw";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import type { AstroPageDraft } from "../../../features/site-draft/types";
import { slugify } from "../../../lib/slugify";
import type { NoticeKind } from "../../../types/notice";
import { provisionSiteDraft } from "../services/site-create-provisioning";

const INITIAL_PROVISION_STEP = "Preparing your site...";
const INITIAL_SITE_TITLE = "New Astro Site";
const INITIAL_SITE_DESCRIPTION = "Describe your site in a sentence or two.";
const INITIAL_PAGES: AstroPageDraft[] = [
  {
    title: "Home",
    slug: "home",
    body: "",
    showInNav: false
  }
];

export const useSiteCreateRouteController = () => {
  const navigate = useNavigate();

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState(INITIAL_PROVISION_STEP);

  const [siteTitle, setSiteTitle] = useState(INITIAL_SITE_TITLE);
  const [siteDescription, setSiteDescription] = useState(INITIAL_SITE_DESCRIPTION);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);

  const { session } = useAuth();

  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);

  useEffect(() => {
    if (!siteImage) {
      setSiteImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(siteImage);
    setSiteImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [siteImage]);

  const handleProvision = async () => {
    setNotice(null);
    setNoticeKind(null);

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    const providerToken = (session as { provider_token?: string }).provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    const supabaseAccessToken = session.access_token?.trim();
    if (!supabaseAccessToken) {
      setNotice("Supabase session missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    setIsProvisioning(true);

    try {
      const siteId = crypto.randomUUID();
      await provisionSiteDraft({
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
        tokensCss: tokensTemplate,
        pages: INITIAL_PAGES,
        onStep: setProvisionStep,
        onSiteUrlResolved: setSiteUrl
      });

      setProvisionStep("Opening your site builder...");
      navigate(`/site-builder?draftId=${siteId}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsProvisioning(false);
    }
  };

  return {
    session,
    notice,
    noticeKind,
    isProvisioning,
    provisionStep,
    siteTitle,
    siteDescription,
    siteImagePreview,
    onSiteTitleChange: setSiteTitle,
    onSiteDescriptionChange: setSiteDescription,
    onSiteImageChange: setSiteImage,
    onBackToStudio: () => navigate("/studio"),
    onCreateSite: () => {
      void handleProvision();
    }
  };
};
