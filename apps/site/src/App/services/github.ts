import { toBase64 } from "../lib/base64";
import { getFreshSupabaseAuthSnapshot } from "../features/auth/services/github-auth";

export async function githubRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const payloadBody: Record<string, unknown> = { ...body };
  const existingSupabaseAccessToken =
    typeof payloadBody.supabase_access_token === "string"
      ? payloadBody.supabase_access_token.trim()
      : "";
  if (!existingSupabaseAccessToken) {
    try {
      const snapshot = await getFreshSupabaseAuthSnapshot();
      const supabaseAccessToken = snapshot.supabaseAccessToken?.trim() ?? "";
      if (supabaseAccessToken) {
        payloadBody.supabase_access_token = supabaseAccessToken;
      }
    } catch {
      // Caller-level auth checks will still surface clearer errors if session is missing.
    }
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payloadBody)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? "GitHub request failed.");
  }

  return payload as T;
}

export async function readTextFile(
  _token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
  allowMissing = false
) {
  try {
    const result = await githubRequest<{ content: string; encoding: string }>(
      "/.netlify/functions/github-contents-read",
      { owner, repo, path, branch }
    );
    if (result?.encoding === "base64") {
      return atob(result.content.replace(/\n/g, ""));
    }
    return result.content ?? "";
  } catch (error) {
    if (allowMissing) return null;
    throw error;
  }
}

export async function listDirectory(
  _token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
) {
  const result = await githubRequest<{ entries: { name: string; path: string; type: string }[] }>(
    "/.netlify/functions/github-contents-list",
    { owner, repo, path, branch }
  );
  return result.entries ?? [];
}

export async function writeTextFile(
  _token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string
) {
  await githubRequest("/.netlify/functions/github-contents-write", {
    owner,
    repo,
    path,
    message: `Update ${path}`,
    content: toBase64(new TextEncoder().encode(content).buffer),
    branch
  });
}

export async function deleteTextFile(
  _token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
) {
  await githubRequest("/.netlify/functions/github-contents-delete", {
    owner,
    repo,
    path,
    message: `Delete ${path}`,
    branch
  });
}
