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
