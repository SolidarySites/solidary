import { createIndexAdminBootstrapSql } from "./index-admin-bootstrap-sql.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

Deno.test("createIndexAdminBootstrapSql includes the provided index id", () => {
  const sql = createIndexAdminBootstrapSql({
    indexId: "index-123",
    slug: "child-index",
    title: "Child Index",
    description: "Index description",
    canonicalUrl: "https://example.com/index",
    imageUrl: "https://example.com/index.jpg",
    projectUrl: "https://project-ref.supabase.co",
    publishableKey: "sb_publishable_key",
    indexLevel: 1,
    parentIndexId: "root-index-1",
    parentIndexUrl: "https://solidary.netlify.app",
    parentIndexLevel: 0,
    parentRepoFullName: "SolidarySites/solidary",
    parentRepoUrl: "https://github.com/SolidarySites/solidary",
  });

  assert(
    sql.includes("values ('index-123'"),
    "Expected generated SQL to include the provided index id.",
  );
});

Deno.test("createIndexAdminBootstrapSql throws a helpful error when indexId is missing", () => {
  let message = "";

  try {
    createIndexAdminBootstrapSql({
      indexId: "",
      slug: "child-index",
      title: "Child Index",
      description: "Index description",
      canonicalUrl: "https://example.com/index",
      imageUrl: "https://example.com/index.jpg",
      projectUrl: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_key",
      indexLevel: 1,
      parentIndexId: "root-index-1",
      parentIndexUrl: "https://solidary.netlify.app",
      parentIndexLevel: 0,
      parentRepoFullName: "SolidarySites/solidary",
      parentRepoUrl: "https://github.com/SolidarySites/solidary",
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert(
    message === "createIndexAdminBootstrapSql requires indexId.",
    `Expected helpful missing-indexId error, received: ${message || "<none>"}`,
  );
});
