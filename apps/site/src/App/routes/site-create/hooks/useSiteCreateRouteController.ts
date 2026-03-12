import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TEMPLATE_SOLIDARY as templateSolidary,
  TEMPLATE_SOLIDARY_LINKS as templateSolidaryLinks,
  TOKENS_TEMPLATE as tokensTemplate
} from "../../../../templates/site";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { requireFreshSupabaseAuth } from "../../../features/auth/services/github-auth";
import type { AstroPageDraft } from "../../../features/site-draft/types";
import { slugify } from "../../../lib/slugify";
import { supabaseFunctionUrl } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";
import { clampSiteDescription } from "../../../services/site-metadata";
import { provisionSiteDraft } from "../services/site-create-provisioning";

const INITIAL_PROVISION_STEP = "Preparing your site...";
const INITIAL_SITE_TITLE = "New Astro Site";
const INITIAL_SITE_DESCRIPTION = "Describe your site in a sentence or two.";
const INITIAL_PAGES: AstroPageDraft[] = [
  {
    title: "Home",
    slug: "home",
    body: "",
    javascript: "",
    showInNav: false
  }
];

type SiteTitleRepoConflict = {
  repoName: string;
  repoUrl: string;
  repositoriesUrl: string;
};

type RepoNameCheckPayload = {
  exists?: boolean;
  owner_login?: string;
  repo_name?: string;
  repo_url?: string;
  repositories_url?: string;
};

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
  const [siteTitleRepoConflict, setSiteTitleRepoConflict] = useState<SiteTitleRepoConflict | null>(
    null
  );
  const [siteTitleRepoCheckInFlight, setSiteTitleRepoCheckInFlight] = useState(false);
  const siteTitleRepoCheckRequestIdRef = useRef(0);

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

  const checkRepoNameConflict = async ({
    repoName,
    supabaseAccessToken
  }: {
    repoName: string;
    supabaseAccessToken: string;
  }): Promise<SiteTitleRepoConflict | null> => {
    const response = await fetch(supabaseFunctionUrl("github-check-repo-name"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${supabaseAccessToken}`
      },
      body: JSON.stringify({
        name: repoName
      })
    });
    const payload = (await response.json().catch(() => ({}))) as RepoNameCheckPayload;
    if (!response.ok || !payload.exists) {
      return null;
    }

    const ownerLogin = payload.owner_login?.trim() ?? "";
    const normalizedRepoName = payload.repo_name?.trim() || repoName;
    const repositoriesUrl =
      payload.repositories_url?.trim() ||
      (ownerLogin ? `https://github.com/${ownerLogin}?tab=repositories` : "https://github.com");
    const repoUrl =
      payload.repo_url?.trim() ||
      (ownerLogin
        ? `https://github.com/${ownerLogin}/${normalizedRepoName}`
        : `https://github.com/${normalizedRepoName}`);

    return {
      repoName: normalizedRepoName,
      repoUrl,
      repositoriesUrl
    };
  };

  const handleSiteTitleBlur = async () => {
    const repoName = slugify(siteTitle);
    if (!repoName) {
      setSiteTitleRepoConflict(null);
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch {
      return;
    }

    const requestId = ++siteTitleRepoCheckRequestIdRef.current;
    setSiteTitleRepoCheckInFlight(true);
    try {
      const conflict = await checkRepoNameConflict({
        repoName,
        supabaseAccessToken: freshAuth.supabaseAccessToken
      });
      if (siteTitleRepoCheckRequestIdRef.current !== requestId) return;
      setSiteTitleRepoConflict(conflict);
    } catch {
      if (siteTitleRepoCheckRequestIdRef.current !== requestId) return;
      setSiteTitleRepoConflict(null);
    } finally {
      if (siteTitleRepoCheckRequestIdRef.current === requestId) {
        setSiteTitleRepoCheckInFlight(false);
      }
    }
  };

  const handleProvision = async () => {
    setNotice(null);
    setNoticeKind(null);

    let freshAuth;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const {
      session: freshSession,
      supabaseAccessToken
    } = freshAuth;

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    try {
      const repoNameConflict = await checkRepoNameConflict({
        repoName: computedSlug,
        supabaseAccessToken
      });
      if (repoNameConflict) {
        setSiteTitleRepoConflict(repoNameConflict);
        setNotice(
          "Pick a different site title. You already have a GitHub repository with that name."
        );
        setNoticeKind("error");
        return;
      }
      setSiteTitleRepoConflict(null);
    } catch {
      // Skip blocking create if preflight check fails unexpectedly.
    }

    setIsProvisioning(true);

    try {
      const siteId = crypto.randomUUID();
      await provisionSiteDraft({
        session: freshSession,
        supabaseAccessToken,
        siteId,
        siteTitle,
        siteDescription,
        siteUrl,
        computedSlug,
        siteImage,
        templateSolidary,
        templateSolidaryLinks,
        tokensCss: tokensTemplate,
        pages: INITIAL_PAGES,
        onStep: setProvisionStep,
        onSiteUrlResolved: setSiteUrl
      });

      setProvisionStep("Opening your site builder...");
      navigate(`/studio/builder?draftId=${siteId}`);
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
    siteTitleRepoConflict,
    siteTitleRepoCheckInFlight,
    onSiteTitleChange: (value: string) => {
      siteTitleRepoCheckRequestIdRef.current += 1;
      setSiteTitleRepoCheckInFlight(false);
      setSiteTitleRepoConflict(null);
      setSiteTitle(value);
    },
    onSiteTitleBlur: () => {
      void handleSiteTitleBlur();
    },
    onSiteDescriptionChange: (value: string) => setSiteDescription(clampSiteDescription(value)),
    onSiteImageChange: setSiteImage,
    onBackToStudio: () => navigate("/studio"),
    onCreateSite: () => {
      void handleProvision();
    }
  };
};
