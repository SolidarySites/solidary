import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DESCRIPTION = "?";
const EXCLUDED_DIRECTORIES = new Set([".git", "dist", "node_modules"]);
const EXCLUDED_FILES = new Set([".DS_Store"]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const structurePath = path.join(appRoot, "STRUCTURE.json");

const toPosix = (value) => value.split(path.sep).join("/");

const countNewlines = (buffer) => {
  let count = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 10) {
      count += 1;
    }
  }
  return count;
};

const safeLatestCommitSha = (fallback) => {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return fallback ?? "?";
  }
};

const readExistingStructure = async () => {
  try {
    const raw = await fs.readFile(structurePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("STRUCTURE.json must contain a top-level object.");
    }
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        generated_at: new Date().toISOString(),
        latest_commit_sha: safeLatestCommitSha("?"),
        root: "apps/site",
        notes: [],
        directories: [],
        files: []
      };
    }
    throw error;
  }
};

const collectPaths = async () => {
  const directories = new Set(["."]);
  const files = [];

  const walk = async (relativeDir) => {
    const absoluteDir = path.join(appRoot, relativeDir === "." ? "" : relativeDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (EXCLUDED_DIRECTORIES.has(entry.name) && entry.isDirectory()) {
        continue;
      }

      if (EXCLUDED_FILES.has(entry.name)) {
        continue;
      }

      const relativePath = relativeDir === "." ? entry.name : `${relativeDir}/${entry.name}`;
      const normalizedPath = toPosix(relativePath);

      if (entry.isDirectory()) {
        directories.add(normalizedPath);
        await walk(normalizedPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(normalizedPath);
      }
    }
  };

  await walk(".");

  const sortedDirectories = [".", ...[...directories].filter((item) => item !== ".").sort((a, b) => a.localeCompare(b))];
  const sortedFiles = files.sort((a, b) => a.localeCompare(b));

  return { directories: sortedDirectories, files: sortedFiles };
};

const buildDescriptionMap = (entries) =>
  new Map(
    Array.isArray(entries)
      ? entries
          .filter((entry) => entry && typeof entry.path === "string")
          .map((entry) => [entry.path, typeof entry.description === "string" ? entry.description : DEFAULT_DESCRIPTION])
      : []
  );

const createStructurePayload = async (existing) => {
  const existingDirectoryDescriptions = buildDescriptionMap(existing.directories);
  const existingFileDescriptions = buildDescriptionMap(existing.files);
  const discovered = await collectPaths();

  const directories = discovered.directories.map((directoryPath) => ({
    path: directoryPath,
    description: existingDirectoryDescriptions.get(directoryPath) ?? DEFAULT_DESCRIPTION
  }));

  const files = await Promise.all(
    discovered.files.map(async (filePath) => {
      const absolutePath = path.join(appRoot, filePath);
      const bytes = await fs.readFile(absolutePath);
      return {
        path: filePath,
        description: existingFileDescriptions.get(filePath) ?? DEFAULT_DESCRIPTION,
        LOC: countNewlines(bytes)
      };
    })
  );

  const basePayload = {
    generated_at: existing.generated_at ?? new Date().toISOString(),
    latest_commit_sha: existing.latest_commit_sha ?? "?",
    root: typeof existing.root === "string" ? existing.root : "apps/site",
    notes: Array.isArray(existing.notes) ? existing.notes : [],
    directories,
    files
  };

  const serializedBase = JSON.stringify(basePayload, null, 2) + "\n";
  const structureLoc = countNewlines(Buffer.from(serializedBase, "utf8"));
  const structureEntry = basePayload.files.find((entry) => entry.path === "STRUCTURE.json");
  if (structureEntry) {
    structureEntry.LOC = structureLoc;
  }

  return basePayload;
};

const stripMetadataForComparison = (value) => ({
  root: value.root,
  notes: value.notes,
  directories: value.directories,
  files: value.files
});

const main = async () => {
  const existing = await readExistingStructure();
  const next = await createStructurePayload(existing);

  const currentComparable = stripMetadataForComparison(existing);
  const nextComparable = stripMetadataForComparison(next);
  const changed = JSON.stringify(currentComparable) !== JSON.stringify(nextComparable);

  if (!changed) {
    console.log("STRUCTURE.json is up to date.");
    return;
  }

  next.generated_at = new Date().toISOString();
  next.latest_commit_sha = safeLatestCommitSha(existing.latest_commit_sha);

  const serialized = JSON.stringify(next, null, 2) + "\n";
  await fs.writeFile(structurePath, serialized, "utf8");
  console.log(`Updated ${path.relative(appRoot, structurePath)} (${next.directories.length} dirs, ${next.files.length} files).`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
