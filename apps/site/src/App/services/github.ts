import { toBase64 } from "../lib/base64";
import { requireFreshSupabaseAuth } from "../features/auth/services/github-auth";
import { supabaseFunctionUrl } from "../lib/supabase";

export async function githubRequest<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { supabaseAccessToken } = await requireFreshSupabaseAuth();
  const payloadBody: Record<string, unknown> = { ...body };
  delete payloadBody.supabase_access_token;

  const response = await fetch(supabaseFunctionUrl(functionName), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`
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
      "github-contents-read",
      { owner, repo, path, branch }
    );
    if (result?.encoding === "base64") {
      const cleaned = result.content.replace(/\n/g, "");
      return new TextDecoder().decode(
        Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0))
      );
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
    "github-contents-list",
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
  await githubRequest("github-contents-write", {
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
  await githubRequest("github-contents-delete", {
    owner,
    repo,
    path,
    message: `Delete ${path}`,
    branch
  });
}
