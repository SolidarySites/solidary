import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import type { NoticeKind } from "../../../types/notice";
import { clampSiteDescription, clampSiteTitle } from "../../../services/site-metadata";
import { slugify } from "../../../lib/slugify";
import { supabaseFunctionUrl } from "../../../lib/supabase";
import { requireFreshSupabaseAuth } from "../../../features/auth/services/github-auth";
import type { IndexCreatePrerequisites } from "../services/types";
import { startIndexProvisioning, waitForIndexProvisioningJob } from "../services/index-create-provisioning";
import {
  INITIAL_PROVISION_STEP,
  type RepoConflict,
  type RepoNameCheckPayload
} from "./indexCreateShared";

type SetRouteNotice = (message: string | null, kind: NoticeKind) => void;

export const useIndexCreateProvisioning = ({
  searchParams,
  setSearchParams,
  selectedOrganizationId,
  prerequisites,
  adminPassword,
  refreshSetup,
  setRouteNotice
}: {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  selectedOrganizationId: string;
  prerequisites: IndexCreatePrerequisites;
  adminPassword: string;
  refreshSetup: (requestedIndexId?: string) => Promise<unknown>;
  setRouteNotice: SetRouteNotice;
}) => {
  const [title, setTitle] = useState("New Index");
  const [description, setDescription] = useState(
    "Describe what this index will track and publish."
  );
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [repoConflict, setRepoConflict] = useState<RepoConflict | null>(null);
  const [repoCheckInFlight, setRepoCheckInFlight] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState(INITIAL_PROVISION_STEP);
  const repoCheckRequestIdRef = useRef(0);

  const computedSlug = useMemo(() => slugify(title), [title]);
  const detailsCanContinue =
    Boolean(title.trim()) &&
    Boolean(description.trim()) &&
    Boolean(adminPassword.trim()) &&
    Boolean(computedSlug) &&
    !repoCheckInFlight &&
    !repoConflict;

  useEffect(() => {
    if (!image) {
      setImagePreview(null);
      return;
    }

    const nextUrl = URL.createObjectURL(image);
    setImagePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  const checkRepoConflict = useCallback(
    async ({
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
    },
    []
  );

  const runRepoAvailabilityCheck = useCallback(async () => {
    const repoName = slugify(title);
    if (!repoName) {
      setRepoConflict(null);
      return null;
    }

    let freshAuth: Awaited<ReturnType<typeof requireFreshSupabaseAuth>>;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch {
      return null;
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
      return nextConflict;
    } catch {
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoConflict(null);
      }
      return null;
    } finally {
      if (repoCheckRequestIdRef.current === requestId) {
        setRepoCheckInFlight(false);
      }
    }
  }, [checkRepoConflict, title]);

  const handleContinueDetails = useCallback(async () => {
    setRouteNotice(null, null);

    if (!title.trim() || !description.trim() || !adminPassword.trim()) {
      setRouteNotice("Add a title, description, and admin password before continuing.", "error");
      return;
    }
    if (!computedSlug) {
      setRouteNotice("Choose a title that can become a GitHub repository name.", "error");
      return;
    }
    if (!prerequisites.ready) {
      setRouteNotice(
        prerequisites.blockingMessage || "Complete the required account connections first.",
        "error"
      );
      return;
    }

    const nextConflict = await runRepoAvailabilityCheck();
    if (nextConflict) {
      setRouteNotice("Choose a different title before creating your index.", "error");
      return;
    }

    setDetailsConfirmed(true);
  }, [
    adminPassword,
    computedSlug,
    description,
    prerequisites,
    runRepoAvailabilityCheck,
    setRouteNotice,
    title
  ]);

  const validateOrganizationSelection = useCallback(() => {
    setRouteNotice(null, null);

    if (!selectedOrganizationId.trim()) {
      setRouteNotice("Choose which Supabase organization should own this index.", "error");
      return false;
    }

    return true;
  }, [selectedOrganizationId, setRouteNotice]);

  const handleCreateIndex = useCallback(async () => {
    setRouteNotice(null, null);

    if (!detailsConfirmed) {
      setRouteNotice("Finish the index details step before creating your index.", "error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshSupabaseAuth();
    } catch (error) {
      setRouteNotice(
        error instanceof Error ? error.message : "Sign in with GitHub to continue.",
        "error"
      );
      return;
    }

    try {
      const nextConflict = await checkRepoConflict({
        repoName: computedSlug,
        supabaseAccessToken: freshAuth.supabaseAccessToken
      });
      if (nextConflict) {
        setRepoConflict(nextConflict);
        setRouteNotice(
          "Choose a different title. You already have a GitHub repository with that name.",
          "error"
        );
        return;
      }
      setRepoConflict(null);
    } catch {
      // Non-blocking preflight failure; the backend still enforces conflicts.
    }

    setIsProvisioning(true);
    setProvisionStep(image ? "Optimizing index image..." : INITIAL_PROVISION_STEP);

    try {
      const { jobId, initialStep } = await startIndexProvisioning({
        supabaseAccessToken: freshAuth.supabaseAccessToken,
        slug: computedSlug,
        title: title.trim(),
        description: description.trim(),
        organizationId: selectedOrganizationId,
        ownerUserId: freshAuth.session.user.id,
        image
      });
      setProvisionStep(initialStep);
      const completedJob = await waitForIndexProvisioningJob({
        jobId,
        supabaseAccessToken: freshAuth.supabaseAccessToken,
        onStep: setProvisionStep
      });

      const createdIndexId = completedJob.index?.id?.trim() ?? "";
      if (!createdIndexId) {
        throw new Error("The new index was created, but the setup route is missing the index id.");
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("indexId", createdIndexId);
      setSearchParams(nextParams, { replace: true });
      await refreshSetup(createdIndexId);
      setRouteNotice("Index created. Continue with the next setup step.", "notice");
    } catch (error) {
      setRouteNotice(
        error instanceof Error ? error.message : "Something went wrong while creating the index.",
        "error"
      );
    } finally {
      setIsProvisioning(false);
    }
  }, [
    checkRepoConflict,
    computedSlug,
    description,
    detailsConfirmed,
    image,
    refreshSetup,
    searchParams,
    selectedOrganizationId,
    setRouteNotice,
    setSearchParams,
    title
  ]);

  return {
    title,
    description,
    detailsConfirmed,
    imagePreview,
    repoConflict,
    repoCheckInFlight,
    isProvisioning,
    provisionStep,
    computedSlug,
    detailsCanContinue,
    image,
    setDetailsConfirmed,
    onTitleChange: (value: string) => {
      repoCheckRequestIdRef.current += 1;
      setRepoCheckInFlight(false);
      setRepoConflict(null);
      setDetailsConfirmed(false);
      setTitle(clampSiteTitle(value));
    },
    onTitleBlur: () => {
      void runRepoAvailabilityCheck();
    },
    onDescriptionChange: (value: string) => {
      setDetailsConfirmed(false);
      setDescription(clampSiteDescription(value));
    },
    onImageChange: (value: File | null) => {
      setDetailsConfirmed(false);
      setImage(value);
    },
    onContinueDetails: () => {
      void handleContinueDetails();
    },
    validateOrganizationSelection,
    onCreateIndex: () => {
      void handleCreateIndex();
    }
  };
};
