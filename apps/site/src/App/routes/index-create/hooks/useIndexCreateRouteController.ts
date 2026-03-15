import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  requireFreshSupabaseAuth,
  getGitHubAuthStatusForCurrentUser
} from "../../../features/auth/services/github-auth";
import {
  getSupabaseManagementStatusForCurrentUser,
  type SupabaseManagementConnectionStatus
} from "../../../features/supabase-management/services/supabase-management";
import { toBase64 } from "../../../lib/base64";
import { slugify } from "../../../lib/slugify";
import { supabaseFunctionUrl } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";
import {
  clampSiteDescription,
  clampSiteTitle
} from "../../../services/site-metadata";
import {
  hasRequiredSupabaseManagementScopes,
  startIndexProvisioning,
  waitForIndexProvisioningJob
} from "../services/index-create-provisioning";
import type {
  IndexCreateOrganizationOption,
  IndexCreatePrerequisites
} from "../services/types";

const INITIAL_PROVISION_STEP = "Preparing your index...";

type RepoConflict = {
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

const buildPrerequisites = ({
  githubConnected,
  supabaseStatus,
  selectedOrganizationId
}: {
  githubConnected: boolean;
  supabaseStatus: SupabaseManagementConnectionStatus | null;
  selectedOrganizationId: string;
}): IndexCreatePrerequisites => {
  const supabaseReady = Boolean(supabaseStatus?.connected);
  const supabaseScopesReady = hasRequiredSupabaseManagementScopes(
    supabaseStatus?.grantedScopes ?? []
  );

  let blockingMessage: string | null = null;
  if (!githubConnected) {
    blockingMessage = "Connect the GitHub App in Profile before creating an index.";
  } else if (!supabaseReady) {
    blockingMessage = "Connect your Supabase account in Profile before creating an index.";
  } else if (!supabaseScopesReady) {
    blockingMessage =
      "Reconnect your Supabase account in Profile so Solidary has the scopes needed to create projects and bootstrap the database.";
  } else if (!selectedOrganizationId) {
    blockingMessage = "Choose the Supabase organization that should own the new project.";
  }

  return {
    githubReady: githubConnected,
    supabaseReady,
    supabaseScopesReady,
    ready: !blockingMessage,
    blockingMessage
  };
};

export const useIndexCreateRouteController = () => {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [githubConnected, setGitHubConnected] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseManagementConnectionStatus | null>(
    null
  );
  const [title, setTitle] = useState("New Index");
  const [description, setDescription] = useState(
    "Describe what this archive will track and publish."
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [repoConflict, setRepoConflict] = useState<RepoConflict | null>(null);
  const [repoCheckInFlight, setRepoCheckInFlight] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState(INITIAL_PROVISION_STEP);
  const repoCheckRequestIdRef = useRef(0);

  const computedSlug = useMemo(() => slugify(title), [title]);
  const organizations = useMemo<IndexCreateOrganizationOption[]>(
    () => supabaseStatus?.organizations ?? [],
    [supabaseStatus]
  );

  const prerequisites = useMemo(
    () =>
      buildPrerequisites({
        githubConnected,
        supabaseStatus,
        selectedOrganizationId
      }),
    [githubConnected, selectedOrganizationId, supabaseStatus]
  );

  useEffect(() => {
    if (!image) {
      setImagePreview(null);
      return;
    }

    const nextUrl = URL.createObjectURL(image);
    setImagePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  useEffect(() => {
    let mounted = true;

    const loadStatuses = async () => {
      setStatusLoading(true);
      try {
        const [githubStatus, nextSupabaseStatus] = await Promise.all([
          getGitHubAuthStatusForCurrentUser(),
          getSupabaseManagementStatusForCurrentUser()
        ]);
        if (!mounted) {
          return;
        }

        setGitHubConnected(Boolean(githubStatus.githubAppConnected));
        setSupabaseStatus(nextSupabaseStatus);
      } catch (error) {
        if (!mounted) {
          return;
        }
        setGitHubConnected(false);
        setSupabaseStatus(null);
        setNotice(error instanceof Error ? error.message : "Could not load account connections.");
        setNoticeKind("error");
      } finally {
        if (mounted) {
          setStatusLoading(false);
        }
      }
    };

    void loadStatuses();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (organizations.length === 1 && !selectedOrganizationId) {
      setSelectedOrganizationId(organizations[0]?.id ?? "");
    }
  }, [organizations, selectedOrganizationId]);

  const checkRepoConflict = async ({
    repoName,
    supabaseAccessToken
  }: {
    repoName: string;
    supabaseAccessToken: string;
  }) => {
    const response = await fetch(supabaseFunctionUrl("github-check-repo-name"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${supabaseAccessToken}`
      },
      body: JSON.stringify({ name: repoName })
    });
    const payload = (await response.json().catch(() => ({}))) as RepoNameCheckPayload;
    if (!response.ok || !payload.exists) {
      return null;
    }

    const ownerLogin = payload.owner_login?.trim() ?? "";
    const normalizedRepoName = payload.repo_name?.trim() || repoName;
    return {
      repoName: normalizedRepoName,
      repoUrl:
        payload.repo_url?.trim() ||
        (ownerLogin
          ? `https://github.com/${ownerLogin}/${normalizedRepoName}`
          : `https://github.com/${normalizedRepoName}`),
      repositoriesUrl:
        payload.repositories_url?.trim() ||
        (ownerLogin ? `https://github.com/${ownerLogin}?tab=repositories` : "https://github.com")
    } satisfies RepoConflict;
  };

  const handleTitleBlur = async () => {
    const repoName = slugify(title);
    if (!repoName) {
      setRepoConflict(null);
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch {
      return;
    }

    const requestId = ++repoCheckRequestIdRef.current;
    setRepoCheckInFlight(true);
    try {
      const nextConflict = await checkRepoConflict({
        repoName,
        supabaseAccessToken: freshAuth.supabaseAccessToken
      });
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoConflict(nextConflict);
      }
    } catch {
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoConflict(null);
      }
    } finally {
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoCheckInFlight(false);
      }
    }
  };

  const handleCreateIndex = async () => {
    setNotice(null);
    setNoticeKind(null);

    if (!title.trim() || !description.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    if (!prerequisites.ready) {
      setNotice(prerequisites.blockingMessage || "Complete the required connections first.");
      setNoticeKind("error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    try {
      const nextConflict = await checkRepoConflict({
        repoName: computedSlug,
        supabaseAccessToken: freshAuth.supabaseAccessToken
      });
      if (nextConflict) {
        setRepoConflict(nextConflict);
        setNotice("Pick a different title. You already have a GitHub repository with that name.");
        setNoticeKind("error");
        return;
      }
      setRepoConflict(null);
    } catch {
      // Non-blocking preflight failure; the backend will still enforce conflicts.
    }

    setIsProvisioning(true);
    setProvisionStep(INITIAL_PROVISION_STEP);

    try {
      const imageContentB64 = image ? toBase64(await image.arrayBuffer()) : undefined;
      const { jobId, initialStep } = await startIndexProvisioning({
        supabaseAccessToken: freshAuth.supabaseAccessToken,
        slug: computedSlug,
        title: title.trim(),
        description: description.trim(),
        organizationId: selectedOrganizationId,
        imageContentB64
      });
      setProvisionStep(initialStep);
      const completedJob = await waitForIndexProvisioningJob({
        jobId,
        supabaseAccessToken: freshAuth.supabaseAccessToken,
        onStep: setProvisionStep
      });

      const createdArchiveId = completedJob.archive?.id?.trim() ?? "";
      const archiveTitle = completedJob.archive?.title?.trim() || title.trim();
      if (!createdArchiveId) {
        throw new Error(`${archiveTitle} was created, but the admin handoff route is missing the archive id.`);
      }
      navigate(`/admin?archiveId=${createdArchiveId}&section=general&created=1`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
      setNoticeKind("error");
    } finally {
      setIsProvisioning(false);
    }
  };

  return {
    notice,
    noticeKind,
    statusLoading,
    title,
    description,
    imagePreview,
    repoConflict,
    repoCheckInFlight,
    prerequisites,
    organizations,
    selectedOrganizationId,
    isProvisioning,
    provisionStep,
    onTitleChange: (value: string) => {
      repoCheckRequestIdRef.current += 1;
      setRepoCheckInFlight(false);
      setRepoConflict(null);
      setTitle(clampSiteTitle(value));
    },
    onTitleBlur: () => {
      void handleTitleBlur();
    },
    onDescriptionChange: (value: string) => setDescription(clampSiteDescription(value)),
    onImageChange: setImage,
    onSelectedOrganizationChange: setSelectedOrganizationId,
    onBackToStudio: () => navigate("/studio"),
    onOpenProfile: () => navigate("/profile"),
    onCreateIndex: () => {
      void handleCreateIndex();
    }
  };
};
