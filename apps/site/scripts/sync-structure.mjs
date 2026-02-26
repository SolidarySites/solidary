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
        tree: {
          path: ".",
          description: DEFAULT_DESCRIPTION,
          directories: [],
          files: []
        }
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
      if (entry.isSymbolicLink()) continue;
      if (EXCLUDED_DIRECTORIES.has(entry.name) && entry.isDirectory()) continue;
      if (EXCLUDED_FILES.has(entry.name)) continue;

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

  return {
    directories: [".", ...[...directories].filter((item) => item !== ".").sort((a, b) => a.localeCompare(b))],
    files: files.sort((a, b) => a.localeCompare(b))
  };
};

const buildDescriptionMapFromEntries = (entries) =>
  new Map(
    Array.isArray(entries)
      ? entries
          .filter((entry) => entry && typeof entry.path === "string")
          .map((entry) => [
            entry.path,
            typeof entry.description === "string" ? entry.description : DEFAULT_DESCRIPTION
          ])
      : []
  );

const collectDescriptionMapsFromTree = (treeNode, directoryMap, fileMap) => {
  if (!treeNode || typeof treeNode !== "object") return;
  if (typeof treeNode.path === "string") {
    directoryMap.set(
      treeNode.path,
      typeof treeNode.description === "string" ? treeNode.description : DEFAULT_DESCRIPTION
    );
  }

  if (Array.isArray(treeNode.files)) {
    treeNode.files.forEach((entry) => {
      if (!entry || typeof entry.path !== "string") return;
      fileMap.set(
        entry.path,
        typeof entry.description === "string" ? entry.description : DEFAULT_DESCRIPTION
      );
    });
  }

  if (Array.isArray(treeNode.directories)) {
    treeNode.directories.forEach((directory) => {
      collectDescriptionMapsFromTree(directory, directoryMap, fileMap);
    });
  }
};

const buildDescriptionMaps = (existing) => {
  const directoryMap = buildDescriptionMapFromEntries(existing.directories);
  const fileMap = buildDescriptionMapFromEntries(existing.files);

  if (existing.tree && typeof existing.tree === "object") {
    collectDescriptionMapsFromTree(existing.tree, directoryMap, fileMap);
  }

  return {
    directoryMap,
    fileMap
  };
};

const dirnamePosix = (value) => {
  const resolved = path.posix.dirname(value);
  return resolved && resolved !== "/" ? resolved : ".";
};

const createStructurePayload = async (existing) => {
  const { directoryMap, fileMap } = buildDescriptionMaps(existing);
  const discovered = await collectPaths();

  const rootNode = {
    path: ".",
    description: directoryMap.get(".") ?? DEFAULT_DESCRIPTION,
    directories: [],
    files: []
  };

  const directoriesByPath = new Map([[".", rootNode]]);
  for (const directoryPath of discovered.directories) {
    if (directoryPath === ".") continue;

    const parentPath = dirnamePosix(directoryPath);
    const parentNode = directoriesByPath.get(parentPath);
    if (!parentNode) {
      throw new Error(`Missing parent directory "${parentPath}" for "${directoryPath}".`);
    }

    const node = {
      path: directoryPath,
      description: directoryMap.get(directoryPath) ?? DEFAULT_DESCRIPTION,
      directories: [],
      files: []
    };

    parentNode.directories.push(node);
    directoriesByPath.set(directoryPath, node);
  }

  const filesByPath = new Map();
  for (const filePath of discovered.files) {
    const parentPath = dirnamePosix(filePath);
    const parentNode = directoriesByPath.get(parentPath);
    if (!parentNode) {
      throw new Error(`Missing parent directory "${parentPath}" for file "${filePath}".`);
    }

    const absolutePath = path.join(appRoot, filePath);
    const bytes = await fs.readFile(absolutePath);
    const fileNode = {
      path: filePath,
      description: fileMap.get(filePath) ?? DEFAULT_DESCRIPTION,
      LOC: countNewlines(bytes)
    };

    parentNode.files.push(fileNode);
    filesByPath.set(filePath, fileNode);
  }

  const payload = {
    generated_at: existing.generated_at ?? new Date().toISOString(),
    latest_commit_sha: existing.latest_commit_sha ?? "?",
    root: typeof existing.root === "string" ? existing.root : "apps/site",
    notes: Array.isArray(existing.notes) ? existing.notes : [],
    tree: rootNode
  };

  const serializedBase = JSON.stringify(payload, null, 2) + "\n";
  const structureLoc = countNewlines(Buffer.from(serializedBase, "utf8"));
  const structureEntry = filesByPath.get("STRUCTURE.json");
  if (structureEntry) {
    structureEntry.LOC = structureLoc;
  }

  return {
    payload,
    directoryCount: discovered.directories.length,
    fileCount: discovered.files.length
  };
};

const stripMetadataForComparison = (value) => ({
  root: typeof value?.root === "string" ? value.root : "apps/site",
  notes: Array.isArray(value?.notes) ? value.notes : [],
  tree: value?.tree ?? null,
  directories: Array.isArray(value?.directories) ? value.directories : null,
  files: Array.isArray(value?.files) ? value.files : null
});

const main = async () => {
  const existing = await readExistingStructure();
  const { payload: next, directoryCount, fileCount } = await createStructurePayload(existing);

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
  console.log(
    `Updated ${path.relative(appRoot, structurePath)} (${directoryCount} dirs, ${fileCount} files).`
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
