import { toBase64 } from "./utils";

export async function githubRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? "GitHub request failed.");
  }

  return payload as T;
}

export async function readTextFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
  allowMissing = false
) {
  try {
    const result = await githubRequest<{ content: string; encoding: string }>(
      "/.netlify/functions/github-contents-read",
      { token, owner, repo, path, branch }
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

export async function writeTextFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string
) {
  await githubRequest("/.netlify/functions/github-contents-write", {
    token,
    owner,
    repo,
    path,
    message: `Update ${path}`,
    content: toBase64(new TextEncoder().encode(content).buffer),
    branch
  });
}
