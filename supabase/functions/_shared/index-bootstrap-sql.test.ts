import { indexBootstrapSql } from "./index-bootstrap-sql.ts";

Deno.test("indexBootstrapSql allows connection federation packages in bootstrap tables", () => {
  if (
    !indexBootstrapSql.includes("index_federation_outbox_entity_type_check") ||
    !indexBootstrapSql.includes("index_federation_receipts_entity_type_check") ||
    !indexBootstrapSql.includes("'connection'")
  ) {
    throw new Error(
      "Expected bootstrap SQL to allow connection entity types in federation tables.",
    );
  }
});
