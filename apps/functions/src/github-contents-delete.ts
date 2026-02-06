import type { Handler } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, path, message, branch } = JSON.parse(event.body ?? "{}");
    if (!token || !owner || !repo || !path) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters." }) };
    }

    const logPrefix = `[github-contents-delete] ${owner}/${repo}:${path}`;

    const url = new URL(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
    if (branch) {
      url.searchParams.set("ref", branch);
    }

    const readResponse = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (readResponse.status === 404) {
      console.log(`${logPrefix} missing`, { branch });
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleted: false })
      };
    }

    if (!readResponse.ok) {
      const readPayload = await readResponse.json().catch(() => ({}));
      console.log(`${logPrefix} read failed`, {
        status: readResponse.status,
        message: readPayload?.message,
        branch
      });
      return {
        statusCode: readResponse.status,
        body: JSON.stringify({ error: readPayload?.message ?? "Failed to read file for delete." })
      };
    }

    const readPayload = await readResponse.json().catch(() => ({}));
    const sha = readPayload?.sha;

    const deleteResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message ?? `Delete ${path}`,
        sha,
        branch
      })
    });

    const deletePayload = await deleteResponse.json().catch(() => ({}));
    console.log(`${logPrefix} delete`, {
      status: deleteResponse.status,
      message: deletePayload?.message,
      branch
    });

    if (!deleteResponse.ok) {
      return {
        statusCode: deleteResponse.status,
        body: JSON.stringify({ error: deletePayload?.message ?? "Failed to delete file." })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deleted: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
