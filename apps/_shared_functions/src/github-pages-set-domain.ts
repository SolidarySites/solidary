import type { Handler } from "@netlify/functions";
import {
  HttpError,
  authorizeGitHubRepoAction,
  safeJson
} from "./github-repo-guardrails";

const GITHUB_API = "https://api.github.com";

type SetDomainBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  domain?: string;
};

type GitHubPagesMetadata = {
  html_url?: string;
  cname?: string;
  build_type?: string;
  source?: {
    branch?: string;
    path?: string;
  };
  message?: string;
};

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
});

const normalizeDomainInput = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const domainOnly = withoutProtocol.split("/")[0] ?? "";
  return domainOnly.replace(/\.+$/, "").trim().toLowerCase();
};

const getGitHubErrorMessage = (payload: unknown, fallback: string) => {
  const message =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { message?: unknown }).message === "string"
      ? (payload as { message: string }).message.trim()
      : "";
  return message || fallback;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = (JSON.parse(event.body ?? "{}") ?? {}) as SetDomainBody;
    const owner = body.owner?.trim() ?? "";
    const repo = body.repo?.trim() ?? "";
    const normalizedDomain = normalizeDomainInput(body.domain);

    if (!owner || !repo || !normalizedDomain) {
      return safeJson(400, { error: "Missing owner, repo, or domain." });
    }

    const { githubToken } = await authorizeGitHubRepoAction({
      functionName: "github-pages-set-domain",
      action: "set_pages_domain",
      owner,
      repo,
      directToken: body.token,
      supabaseAccessToken: body.supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const existingPagesResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
      headers: githubHeaders(githubToken)
    });
    const existingPagesPayload = (await existingPagesResponse
      .json()
      .catch(() => ({}))) as GitHubPagesMetadata;

    if (!existingPagesResponse.ok) {
      const errorMessage =
        existingPagesResponse.status === 404
          ? "GitHub Pages is not enabled for this repository yet."
          : getGitHubErrorMessage(existingPagesPayload, "Failed to read GitHub Pages settings.");
      return safeJson(existingPagesResponse.status, { error: errorMessage });
    }

    const sourceBranch = existingPagesPayload.source?.branch?.trim() ?? "";
    const sourcePath = existingPagesPayload.source?.path?.trim() || "/";
    const buildType = existingPagesPayload.build_type?.trim();
    const updatePayload: Record<string, unknown> = {
      cname: normalizedDomain
    };
    if (sourceBranch) {
      updatePayload.source = {
        branch: sourceBranch,
        path: sourcePath
      };
    }
    if (buildType) {
      updatePayload.build_type = buildType;
    }

    const updateResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
      method: "PUT",
      headers: githubHeaders(githubToken),
      body: JSON.stringify(updatePayload)
    });
    const updateResult = (await updateResponse.json().catch(() => ({}))) as GitHubPagesMetadata;

    if (!updateResponse.ok) {
      return safeJson(updateResponse.status, {
        error: getGitHubErrorMessage(updateResult, "Failed to update custom domain.")
      });
    }

    return safeJson(200, {
      status: "updated",
      domain: normalizedDomain,
      pages: updateResult,
      pagesUrl: updateResult.html_url || existingPagesPayload.html_url || null
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return safeJson(error.statusCode, { error: error.message });
    }
    return safeJson(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
