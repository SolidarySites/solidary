#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, "supabase", "functions", "_manifest.json");

const projectRef = process.env.SUPABASE_PROJECT_REF_PROD?.trim() ?? "";
if (!projectRef) {
  console.error("Missing SUPABASE_PROJECT_REF_PROD environment variable.");
  process.exit(1);
}

const managementAccessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "";
if (!managementAccessToken) {
  console.error("Missing SUPABASE_ACCESS_TOKEN environment variable.");
  process.exit(1);
}

const adminPassword = process.env.ADMIN_PASSWORD?.trim() ?? "";
const SUPABASE_MANAGEMENT_API = "https://api.supabase.com";
const PROJECT_FUNCTION_SERVICE_SECRET_NAMES = [
  "SOLIDARY_SECRET_KEY",
  "DELETE_REPO_SUPABASE_SECRET_KEY",
  "CREATE_SITE_SUPABASE_API_KEY",
];

const runOrExit = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const getManagementErrorMessage = (payload, fallback) => {
  if (payload && typeof payload === "object" && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return fallback;
};

const managementRequest = async (pathName, init = {}) => {
  const response = await fetch(new URL(pathName, SUPABASE_MANAGEMENT_API), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${managementAccessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const extractApiKeyValue = (payload, type) => {
  const normalizedType = type.trim().toLowerCase();
  const readValue = (entry) => {
    if (!entry || typeof entry !== "object") return "";
    const row = entry;
    const rowType = typeof row.type === "string" ? row.type.trim().toLowerCase() : "";
    if (rowType && rowType !== normalizedType) return "";
    return (
      (typeof row.api_key === "string" ? row.api_key : "") ||
      (typeof row.key === "string" ? row.key : "") ||
      (typeof row.value === "string" ? row.value : "") ||
      (typeof row.token === "string" ? row.token : "")
    ).trim();
  };

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const value = readValue(entry);
      if (value) return value;
    }
    return "";
  }

  if (payload && typeof payload === "object") {
    const directValue = typeof payload[normalizedType] === "string"
      ? payload[normalizedType]
      : "";
    if (directValue.trim()) {
      return directValue.trim();
    }
    if (Array.isArray(payload.keys)) {
      return extractApiKeyValue(payload.keys, type);
    }
    return readValue(payload);
  }

  return "";
};

const ensureProjectSecretApiKey = async () => {
  const readKeys = async () =>
    managementRequest(`/v1/projects/${projectRef}/api-keys?reveal=true`);

  const createSecretKey = async () => {
    const { response, payload } = await managementRequest(
      `/v1/projects/${projectRef}/api-keys?reveal=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "secret",
          name: "default",
          secret_jwt_template: {
            role: "service_role",
          },
        }),
      },
    );

    if (!response.ok) {
      console.error(getManagementErrorMessage(payload, "Failed to create secret API key."));
      process.exit(1);
    }
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { response, payload } = await readKeys();
    if (response.ok) {
      const secretKey = extractApiKeyValue(payload, "secret");
      if (secretKey) return secretKey;
    }

    await createSecretKey();
  }

  console.error("Could not resolve the project's secret API key.");
  process.exit(1);
};

runOrExit("node", ["./scripts/generate-github-create-repo-template-bundle.mjs"]);
runOrExit("node", ["./scripts/generate-index-create-template-bundle.mjs"]);
runOrExit("node", ["./scripts/generate-index-bootstrap-sql.mjs"]);

const projectSecretApiKey = await ensureProjectSecretApiKey();
const projectSecretsToSet = PROJECT_FUNCTION_SERVICE_SECRET_NAMES.map((name) =>
  `${name}=${projectSecretApiKey}`
);
if (adminPassword) {
  projectSecretsToSet.push(`ADMIN_PASSWORD=${adminPassword}`);
}

if (projectSecretsToSet.length) {
  console.log(`Updating Supabase function secrets for project ${projectRef}`);
  runOrExit("supabase", [
    "secrets",
    "set",
    ...projectSecretsToSet,
    "--project-ref",
    projectRef,
  ]);
}

const rawManifest = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(rawManifest);
const functions = Array.isArray(manifest?.functions)
  ? manifest.functions.filter((value) => typeof value === "string" && value.trim())
  : [];

if (!functions.length) {
  console.error("No function names found in supabase/functions/_manifest.json.");
  process.exit(1);
}

for (const functionName of functions) {
  console.log(`Deploying Supabase function: ${functionName}`);
  runOrExit("supabase", [
    "functions",
    "deploy",
    functionName,
    "--project-ref",
    projectRef,
    "--no-verify-jwt"
  ]);
}

console.log(`Deployed ${functions.length} Supabase functions to project ${projectRef}.`);
