import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";
import {
  HttpError,
  authorizeGitHubRepoAction,
  safeJson
} from "../_shared/github-repo-guardrails.ts";

const GITHUB_API = "https://api.github.com";
const DNS_CHECK_RETRY_DELAYS_MS = [0, 1500, 3000];

type SetDomainBody = {
  token?: string;
  supabase_access_token?: string;
  owner?: string;
  repo?: string;
  domain?: string;
  action?: "connect" | "check" | "remove";
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

type GitHubPagesHealthDomain = {
  host?: string;
  is_valid?: boolean;
  reason?: string | null;
  https_error?: string | null;
  caa_error?: string | null;
};

type GitHubPagesHealth = {
  domain?: GitHubPagesHealthDomain | null;
  alt_domain?: GitHubPagesHealthDomain | null;
  message?: string;
};

type DnsFeedback = {
  status: "valid" | "invalid" | "pending";
  message: string;
  details: GitHubPagesHealth | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const fetchPagesMetadata = async ({
  owner,
  repo,
  token
}: {
  owner: string;
  repo: string;
  token: string;
}) => {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
    headers: githubHeaders(token)
  });
  const payload = (await response.json().catch(() => ({}))) as GitHubPagesMetadata;
  return { response, payload };
};

const getHealthReasons = (health: GitHubPagesHealth | null): string[] => {
  if (!health) return [];
  const reasons: string[] = [];
  const candidates = [health.domain, health.alt_domain];
  candidates.forEach((entry) => {
    if (!entry) return;
    if (typeof entry.reason === "string" && entry.reason.trim()) reasons.push(entry.reason.trim());
    if (typeof entry.https_error === "string" && entry.https_error.trim()) {
      reasons.push(entry.https_error.trim());
    }
    if (typeof entry.caa_error === "string" && entry.caa_error.trim()) reasons.push(entry.caa_error.trim());
  });
  return Array.from(new Set(reasons));
};

const resolveDnsFeedbackFromHealth = ({
  health,
  domain
}: {
  health: GitHubPagesHealth | null;
  domain: string;
}): DnsFeedback => {
  const domainHealth = health?.domain ?? null;
  const altDomainHealth = health?.alt_domain ?? null;
  const domainValid = domainHealth?.is_valid === true;
  const altDomainValid = altDomainHealth ? altDomainHealth.is_valid === true : true;

  if (domainValid && altDomainValid) {
    return {
      status: "valid",
      message: `DNS looks good for ${domain}.`,
      details: health
    };
  }

  const reasons = getHealthReasons(health);
  const joinedReasons = reasons.join(" ");
  return {
    status: "invalid",
    message: joinedReasons || `DNS records for ${domain} are not valid yet.`,
    details: health
  };
};

const fetchDnsFeedback = async ({
  owner,
  repo,
  token,
  domain
}: {
  owner: string;
  repo: string;
  token: string;
  domain: string;
}): Promise<DnsFeedback> => {
  let lastPendingMessage = `GitHub is still checking DNS for ${domain}.`;

  for (const delay of DNS_CHECK_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay);
    }

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages/health`, {
      headers: githubHeaders(token)
    });
    const payload = (await response.json().catch(() => ({}))) as GitHubPagesHealth;

    if (response.status === 202) {
      const pendingMessage = getGitHubErrorMessage(
        payload,
        `GitHub is still checking DNS for ${domain}.`
      );
      lastPendingMessage = pendingMessage;
      continue;
    }

    if (response.status === 404) {
      return {
        status: "pending",
        message: "GitHub Pages DNS health check is not ready yet.",
        details: null
      };
    }

    if (!response.ok) {
      const errorMessage = getGitHubErrorMessage(payload, "Failed to check DNS health.");
      return {
        status: "invalid",
        message: errorMessage,
        details: payload ?? null
      };
    }

    return resolveDnsFeedbackFromHealth({
      health: payload ?? null,
      domain
    });
  }

  return {
    status: "pending",
    message: lastPendingMessage,
    details: null
  };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = (JSON.parse(event.body ?? "{}") ?? {}) as SetDomainBody;
    const owner = body.owner?.trim() ?? "";
    const repo = body.repo?.trim() ?? "";
    const action =
      body.action === "check" || body.action === "remove" ? body.action : "connect";
    const requestedDomain = normalizeDomainInput(body.domain);

    if (!owner || !repo) {
      return safeJson(400, { error: "Missing owner or repo." });
    }

    if (action === "connect" && !requestedDomain) {
      return safeJson(400, { error: "Missing domain." });
    }

    const { githubToken } = await authorizeGitHubRepoAction({
      functionName: "github-pages-set-domain",
      action:
        action === "check"
          ? "check_pages_domain"
          : action === "remove"
            ? "remove_pages_domain"
            : "set_pages_domain",
      owner,
      repo,
      directToken: body.token,
      supabaseAccessToken: body.supabase_access_token,
      authorizationHeader: event.headers.authorization ?? event.headers.Authorization
    });

    const initialPages = await fetchPagesMetadata({
      owner,
      repo,
      token: githubToken
    });
    if (!initialPages.response.ok) {
      const errorMessage =
        initialPages.response.status === 404
          ? "GitHub Pages is not enabled for this repository yet."
          : getGitHubErrorMessage(initialPages.payload, "Failed to read GitHub Pages settings.");
      return safeJson(initialPages.response.status, { error: errorMessage });
    }

    const effectiveDomain = requestedDomain || normalizeDomainInput(initialPages.payload.cname);
    if (!effectiveDomain) {
      return safeJson(400, {
        error: "No custom domain is configured yet. Connect a domain first."
      });
    }

    if (action === "connect" || action === "remove") {
      const sourceBranch = initialPages.payload.source?.branch?.trim() ?? "";
      const sourcePath = initialPages.payload.source?.path?.trim() || "/";
      const buildType = initialPages.payload.build_type?.trim();
      const updatePayload: Record<string, unknown> = {
        cname: action === "remove" ? null : effectiveDomain
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
      const updatePayloadResult = (await updateResponse
        .json()
        .catch(() => ({}))) as GitHubPagesMetadata;
      if (!updateResponse.ok) {
        if (action === "remove") {
          const fallbackPayload: Record<string, unknown> = {
            ...updatePayload,
            cname: ""
          };
          const fallbackResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
            method: "PUT",
            headers: githubHeaders(githubToken),
            body: JSON.stringify(fallbackPayload)
          });
          const fallbackResult = (await fallbackResponse
            .json()
            .catch(() => ({}))) as GitHubPagesMetadata;
          if (fallbackResponse.ok) {
            const latestPagesAfterFallback = await fetchPagesMetadata({
              owner,
              repo,
              token: githubToken
            });
            return safeJson(200, {
              status: "removed",
              domain: "",
              pages:
                latestPagesAfterFallback.response.ok
                  ? latestPagesAfterFallback.payload
                  : fallbackResult,
              pagesUrl:
                (latestPagesAfterFallback.response.ok
                  ? latestPagesAfterFallback.payload.html_url
                  : fallbackResult.html_url) || null,
              dns: {
                status: "pending",
                message: "Proposed custom domain removed from GitHub Pages."
              }
            });
          }
        }
        return safeJson(updateResponse.status, {
          error: getGitHubErrorMessage(updatePayloadResult, "Failed to update custom domain.")
        });
      }
    }

    const latestPages = await fetchPagesMetadata({
      owner,
      repo,
      token: githubToken
    });

    if (action === "remove") {
      return safeJson(200, {
        status: "removed",
        domain: "",
        pages: latestPages.response.ok ? latestPages.payload : initialPages.payload,
        pagesUrl:
          (latestPages.response.ok ? latestPages.payload.html_url : initialPages.payload.html_url) || null,
        dns: {
          status: "pending",
          message: "Proposed custom domain removed from GitHub Pages."
        }
      });
    }

    const dns = await fetchDnsFeedback({
      owner,
      repo,
      token: githubToken,
      domain: effectiveDomain
    });

    return safeJson(200, {
      status: action === "check" ? "checked" : "connected",
      domain: effectiveDomain,
      pages: latestPages.response.ok ? latestPages.payload : initialPages.payload,
      pagesUrl:
        (latestPages.response.ok ? latestPages.payload.html_url : initialPages.payload.html_url) || null,
      dns
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


Deno.serve((request) => runHandler(request, handler));
