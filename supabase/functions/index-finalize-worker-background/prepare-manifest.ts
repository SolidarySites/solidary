import { Buffer } from "node:buffer";
import type { IndexFinalizationSourceManifestEntry } from "../_shared/index-finalization.ts";
import {
  buildSourceManifestFromTreeEntries,
  findSourceTreeBlobEntryByPath,
  parseSourcePublishIgnoreFile,
  SOURCE_PUBLISH_IGNORE_PATH,
  type SourceTreeEntry,
} from "./helpers.ts";

export const readSourcePublishIgnoreRules = async ({
  treeEntries,
  loadBlobBase64,
}: {
  treeEntries: SourceTreeEntry[];
  loadBlobBase64: (blobSha: string) => Promise<string>;
}) => {
  const ignoreEntry = findSourceTreeBlobEntryByPath({
    treeEntries,
    path: SOURCE_PUBLISH_IGNORE_PATH,
  });
  const ignoreSha = typeof ignoreEntry?.sha === "string" ? ignoreEntry.sha.trim() : "";
  if (!ignoreSha) {
    throw new Error(
      `Finalization source repo is missing required ignore file at ${SOURCE_PUBLISH_IGNORE_PATH}.`,
    );
  }

  const contentB64 = await loadBlobBase64(ignoreSha);
  const content = Buffer.from(contentB64, "base64").toString("utf8");
  return parseSourcePublishIgnoreFile(content);
};

export const prepareSourceManifest = async ({
  treeEntries,
  generatedEntries,
  loadBlobBase64,
}: {
  treeEntries: SourceTreeEntry[];
  generatedEntries: IndexFinalizationSourceManifestEntry[];
  loadBlobBase64: (blobSha: string) => Promise<string>;
}) => {
  const exclusionRules = await readSourcePublishIgnoreRules({
    treeEntries,
    loadBlobBase64,
  });

  return buildSourceManifestFromTreeEntries({
    treeEntries,
    exclusionRules,
    generatedEntries,
  });
};
