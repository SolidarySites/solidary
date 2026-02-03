import type { Handler } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";

export const handler: Handler = async (event) => {
  console.log("[github-create-repo] invoked", {
    method: event.httpMethod,
    hasBody: Boolean(event.body)
  });
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, name, description, private: isPrivate } = JSON.parse(event.body ?? "{}");
    console.log("[github-create-repo] payload", {
      hasToken: Boolean(token),
      name,
      descriptionLength: typeof description === "string" ? description.length : 0,
      isPrivate
    });
    if (!token || !name) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing token or name." }) };
    }

    const templateOwner = process.env.GITHUB_TEMPLATE_OWNER;
    const templateRepo = process.env.GITHUB_TEMPLATE_REPO;
    console.log("[github-create-repo] template config", {
      templateOwner,
      templateRepo
    });

    if (!templateOwner || !templateRepo) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing GitHub template configuration." })
      };
    }

    const response = await fetch(`${GITHUB_API}/repos/${templateOwner}/${templateRepo}/templates/default-theme`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        description,
        private: Boolean(isPrivate)
      })
    });

    const payload = await response.json().catch(() => ({}));
    console.log("[github-create-repo] github response", {
      status: response.status,
      statusText: response.statusText,
      message: payload?.message,
      documentation_url: payload?.documentation_url
    });
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: payload?.message ?? "GitHub repo creation failed." })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: payload })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })
    };
  }
};
