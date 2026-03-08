import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../../../../../lib/supabase";
import { toBase64 } from "../../../../../../lib/base64";
import { githubRequest } from "../../../../../../services/github";
import type { RepoFileSet } from "../../../../../../features/site-draft/types";
import { FILE_KEYS } from "../../services/constants";
import type { DraftState } from "../../services/types";

export const normalizeCustomDomainInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const domainOnly = withoutProtocol.split("/")[0] ?? "";
  return domainOnly.replace(/\.+$/, "").trim().toLowerCase();
};

export const resolveRepoCoordinates = (repoFullName: string) => {
  const [owner, repo] = repoFullName.trim().split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository name. Please reload and try again.");
  }
  return { owner, repo };
};

export const loadLatestDraftSolidaryRaw = async ({
  targetDraftId,
  setDraftState
}: {
  targetDraftId: string;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
}) => {
  const { data, error } = await supabase
    .from("site_drafts")
    .select("files")
    .eq("id", targetDraftId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const files = (data?.files as RepoFileSet | null) ?? null;
  const solidaryRaw =
    typeof files?.[FILE_KEYS.solidary] === "string" ? files[FILE_KEYS.solidary] : "";

  if (solidaryRaw.trim()) {
    setDraftState((current) =>
      current
        ? {
            ...current,
            files: {
              [FILE_KEYS.solidary]: solidaryRaw
            }
          }
        : current
    );
  }

  return solidaryRaw;
};

export const publishSolidaryManifestToRepo = async ({
  draftState,
  message,
  solidaryRaw
}: {
  draftState: DraftState;
  message: string;
  solidaryRaw: string;
}) => {
  const { owner, repo } = resolveRepoCoordinates(draftState.repoFullName);

  await githubRequest("github-contents-batch-commit", {
    owner,
    repo,
    branch: draftState.branch,
    message,
    upserts: [
      {
        path: FILE_KEYS.solidary,
        mode: "100644",
        content: toBase64(new TextEncoder().encode(solidaryRaw).buffer)
      }
    ],
    deletes: []
  });
};

export const upsertPublishedSiteRecord = async ({
  siteId,
  canonicalUrl,
  title,
  description,
  imageUrl
}: {
  siteId: string;
  canonicalUrl: string;
  title: string;
  description: string;
  imageUrl: string;
}) => {
  const { error } = await supabase.from("sites").upsert({
    id: siteId,
    canonical_url: canonicalUrl.trim(),
    title: title.trim(),
    description: description.trim(),
    image_url: imageUrl,
    meta: {
      completion: "complete",
      source: "studio"
    }
  });

  if (error) {
    throw new Error(error.message);
  }
};
