import { supabase } from "../../../../../../lib/supabase";
import {
  FILE_KEYS,
  PAGE_PATH_PREFIX,
  PAGE_PATH_SUFFIX,
  TEMPLATE_RUNTIME_FILE_PATHS
} from "../constants";
import type { BuilderEditableSectionKey, BuilderPage } from "../types";
import { getPageSafeSlug } from "../utils";
import { normalizeEditorTouchedSections, normalizeSlugSet } from "./shared";

export const buildEditorFileChanges = ({
  touchedSections,
  touchedPageSlugs,
  deletedPageSlugs,
  normalizedPages,
  files
}: {
  touchedSections: Set<BuilderEditableSectionKey>;
  touchedPageSlugs: Set<string>;
  deletedPageSlugs: Set<string>;
  normalizedPages: BuilderPage[];
  files: Record<string, string>;
}) => {
  const upsertsByPath = new Map<string, string>();
  if (touchedSections.has("metadata")) {
    const solidaryFile = files[FILE_KEYS.solidary];
    const solidaryContentFile = files[FILE_KEYS.solidaryContent];
    if (solidaryFile) upsertsByPath.set(FILE_KEYS.solidary, solidaryFile);
    if (solidaryContentFile) upsertsByPath.set(FILE_KEYS.solidaryContent, solidaryContentFile);
    TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
      const runtimeContent = files[path];
      if (runtimeContent) upsertsByPath.set(path, runtimeContent);
    });
  }
  if (touchedSections.has("header")) {
    const headerFile = files[FILE_KEYS.headerContent];
    if (headerFile) upsertsByPath.set(FILE_KEYS.headerContent, headerFile);
    TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
      const runtimeContent = files[path];
      if (runtimeContent) upsertsByPath.set(path, runtimeContent);
    });
  }
  if (touchedSections.has("footer")) {
    const footerFile = files[FILE_KEYS.footerContent];
    if (footerFile) upsertsByPath.set(FILE_KEYS.footerContent, footerFile);
    TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
      const runtimeContent = files[path];
      if (runtimeContent) upsertsByPath.set(path, runtimeContent);
    });
  }
  if (touchedSections.has("styles")) {
    const tokensFile = files[FILE_KEYS.tokens];
    if (tokensFile) upsertsByPath.set(FILE_KEYS.tokens, tokensFile);
  }
  if (touchedSections.has("pages") || touchedPageSlugs.size || deletedPageSlugs.size) {
    normalizedPages.forEach((page, index) => {
      const safeSlug = getPageSafeSlug(page, index).trim().toLowerCase();
      if (!safeSlug) return;
      if (touchedPageSlugs.size && !touchedPageSlugs.has(safeSlug)) return;
      const path = `${PAGE_PATH_PREFIX}${safeSlug}${PAGE_PATH_SUFFIX}`;
      const content = files[path];
      if (content) {
        upsertsByPath.set(path, content);
      }
    });
  }

  const deletePaths = Array.from(deletedPageSlugs).map(
    (slugValue) => `${PAGE_PATH_PREFIX}${slugValue}${PAGE_PATH_SUFFIX}`
  );

  return {
    upsertsByPath,
    deletePaths
  };
};

export const createCollaborationPullRequest = async ({
  draftId,
  providerToken,
  sessionAccessToken,
  sessionDisplayName,
  touchedSections
}: {
  draftId: string;
  providerToken: string;
  sessionAccessToken: string | null;
  sessionDisplayName: string;
  touchedSections: Set<BuilderEditableSectionKey>;
}) => {
  const prResponse = await fetch("/.netlify/functions/github-upsert-collaboration-pr", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${sessionAccessToken ?? ""}`
    },
    body: JSON.stringify({
      draftId,
      githubToken: providerToken,
      title: `Studio changes by ${sessionDisplayName}`,
      body: `Touched sections: ${Array.from(touchedSections).join(", ") || "n/a"}`
    })
  });
  const prPayload = (await prResponse.json().catch(() => ({}))) as {
    error?: string;
    pullRequest?: {
      number?: number;
      url?: string;
      state?: string;
    };
  };
  if (!prResponse.ok) {
    throw new Error(prPayload.error ?? "Failed to create pull request.");
  }

  const prNumber = Number(prPayload.pullRequest?.number ?? 0);
  const prUrl = typeof prPayload.pullRequest?.url === "string" ? prPayload.pullRequest.url : "";
  if (!prNumber || !prUrl) {
    throw new Error("Pull request was created but no URL was returned.");
  }

  return {
    prNumber,
    prUrl,
    prState: typeof prPayload.pullRequest?.state === "string" ? prPayload.pullRequest.state : "open"
  };
};

export const loadEditorTouchedState = async (draftId: string) => {
  const { data: latestDraftState, error: latestDraftStateError } = await supabase
    .from("site_drafts")
    .select("touched_sections, touched_page_slugs, deleted_page_slugs")
    .eq("id", draftId)
    .maybeSingle();
  if (latestDraftStateError) {
    throw new Error(latestDraftStateError.message);
  }

  const touchedSections = new Set(
    normalizeEditorTouchedSections((latestDraftState?.touched_sections as string[] | null) ?? [])
  );
  const touchedPageSlugs = normalizeSlugSet(
    (latestDraftState?.touched_page_slugs as string[] | null) ?? []
  );
  const deletedPageSlugs = normalizeSlugSet(
    (latestDraftState?.deleted_page_slugs as string[] | null) ?? []
  );

  return {
    touchedSections,
    touchedPageSlugs,
    deletedPageSlugs
  };
};
