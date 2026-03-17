import { Buffer } from "node:buffer";
import { SOURCE_PUBLISH_IGNORE_PATH } from "./helpers.ts";
import { prepareSourceManifest } from "./prepare-manifest.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, received ${JSON.stringify(actual, null, 2)}`,
    );
  }
};

const assertRejects = async (
  action: () => Promise<unknown>,
  expectedMessage: string,
) => {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) {
      return;
    }
    throw new Error(
      `Expected error ${JSON.stringify(expectedMessage)}, received ${
        error instanceof Error ? JSON.stringify(error.message) : JSON.stringify(error)
      }`,
    );
  }

  throw new Error(`Expected error ${JSON.stringify(expectedMessage)}, but no error was thrown.`);
};

Deno.test("prepareSourceManifest fails when the source repo is missing the publish ignore file", async () => {
  await assertRejects(
    () =>
      prepareSourceManifest({
        treeEntries: [
          { path: "apps/site/src/App/App.tsx", mode: "100644", type: "blob", sha: "sha-app" },
        ],
        generatedEntries: [],
        loadBlobBase64: async () => "",
      }),
    `Finalization source repo is missing required ignore file at ${SOURCE_PUBLISH_IGNORE_PATH}.`,
  );
});

Deno.test("prepareSourceManifest reads source-controlled exclusions and keeps the ignore file by default", async () => {
  const manifest = await prepareSourceManifest({
    treeEntries: [
      {
        path: SOURCE_PUBLISH_IGNORE_PATH,
        mode: "100644",
        type: "blob",
        sha: "sha-ignore",
      },
      { path: "apps/site/dist/index.js", mode: "100644", type: "blob", sha: "sha-dist" },
      { path: "apps/site/src/App/App.tsx", mode: "100644", type: "blob", sha: "sha-app" },
    ],
    generatedEntries: [],
    loadBlobBase64: async (blobSha) => {
      if (blobSha !== "sha-ignore") {
        throw new Error(`Unexpected blob requested: ${blobSha}`);
      }
      return Buffer.from("apps/site/dist/\n", "utf8").toString("base64");
    },
  });

  assertEquals(manifest, [
    {
      kind: "source",
      path: "apps/site/src/App/App.tsx",
      mode: "100644",
      sourceSha: "sha-app",
    },
    {
      kind: "source",
      path: SOURCE_PUBLISH_IGNORE_PATH,
      mode: "100644",
      sourceSha: "sha-ignore",
    },
  ]);
});
