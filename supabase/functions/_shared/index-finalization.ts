export type IndexFinalizationPhase =
  | "prepare_manifest"
  | "materialize_blobs"
  | "commit_finalize";

export type IndexFinalizationSourceManifestEntry =
  | {
      kind: "source";
      path: string;
      mode: "100644" | "100755";
      sourceSha: string;
    }
  | {
      kind: "generated";
      path: string;
      mode: "100644" | "100755";
      contentB64: string;
    };

export type IndexFinalizationPreparedTreeEntry = {
  path: string;
  mode: "100644" | "100755";
  sha: string;
};

export type IndexFinalizationPayloadState = {
  phase: IndexFinalizationPhase | null;
  sourceBranch: string | null;
  sourceManifest: IndexFinalizationSourceManifestEntry[];
  cursor: number;
  finalTreeEntries: IndexFinalizationPreparedTreeEntry[];
  totalFiles: number;
  processedFiles: number;
  sourceRepoResolution: string | null;
  targetRepoFullName: string | null;
  childProjectRef: string | null;
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toMode = (value: unknown): "100644" | "100755" | null => {
  const normalized = toTrimmedString(value);
  return normalized === "100755" ? "100755" : normalized === "100644" ? "100644" : null;
};

const toNonNegativeInteger = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
};

const isPhase = (value: unknown): value is IndexFinalizationPhase =>
  value === "prepare_manifest" ||
  value === "materialize_blobs" ||
  value === "commit_finalize";

const parseSourceManifestEntry = (value: unknown): IndexFinalizationSourceManifestEntry | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const kind = toTrimmedString(record.kind);
  const path = toTrimmedString(record.path);
  const mode = toMode(record.mode);
  if (!path || !mode) {
    return null;
  }

  if (kind === "source") {
    const sourceSha = toTrimmedString(record.sourceSha);
    if (!sourceSha) {
      return null;
    }

    return {
      kind: "source",
      path,
      mode,
      sourceSha
    };
  }

  if (kind === "generated") {
    const contentB64 = toTrimmedString(record.contentB64);
    if (!contentB64) {
      return null;
    }

    return {
      kind: "generated",
      path,
      mode,
      contentB64
    };
  }

  return null;
};

const parsePreparedTreeEntry = (value: unknown): IndexFinalizationPreparedTreeEntry | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const path = toTrimmedString(record.path);
  const mode = toMode(record.mode);
  const sha = toTrimmedString(record.sha);
  if (!path || !mode || !sha) {
    return null;
  }

  return {
    path,
    mode,
    sha
  };
};

export const parseIndexFinalizationPayload = (value: unknown): IndexFinalizationPayloadState => {
  const record = asRecord(value);
  const sourceManifestRaw = Array.isArray(record?.source_manifest)
    ? record.source_manifest
    : [];
  const finalTreeEntriesRaw = Array.isArray(record?.final_tree_entries)
    ? record.final_tree_entries
    : [];

  const totalFiles = toNonNegativeInteger(record?.total_files);
  const processedFiles = toNonNegativeInteger(record?.processed_files);
  const cursor = toNonNegativeInteger(record?.cursor);

  return {
    phase: isPhase(record?.phase) ? record.phase : null,
    sourceBranch: toTrimmedString(record?.source_branch) || null,
    sourceManifest: sourceManifestRaw
      .map(parseSourceManifestEntry)
      .filter((entry): entry is IndexFinalizationSourceManifestEntry => Boolean(entry)),
    cursor,
    finalTreeEntries: finalTreeEntriesRaw
      .map(parsePreparedTreeEntry)
      .filter((entry): entry is IndexFinalizationPreparedTreeEntry => Boolean(entry)),
    totalFiles,
    processedFiles: Math.min(processedFiles, totalFiles || processedFiles),
    sourceRepoResolution: toTrimmedString(record?.source_repo_resolution) || null,
    targetRepoFullName: toTrimmedString(record?.target_repo_full_name) || null,
    childProjectRef: toTrimmedString(record?.child_project_ref) || null
  };
};
