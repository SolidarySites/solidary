import { buildIndexParentConnectionUuid } from "./index-parent-connection.ts";

Deno.test("buildIndexParentConnectionUuid is deterministic per source and target", () => {
  const connectionA = buildIndexParentConnectionUuid({
    sourceIndexId: "11111111-1111-1111-1111-111111111111",
    targetIndexId: "22222222-2222-2222-2222-222222222222",
  });
  const connectionB = buildIndexParentConnectionUuid({
    sourceIndexId: "11111111-1111-1111-1111-111111111111",
    targetIndexId: "22222222-2222-2222-2222-222222222222",
  });

  if (connectionA !== connectionB) {
    throw new Error("Expected the parent connection UUID to be deterministic.");
  }
});

Deno.test("buildIndexParentConnectionUuid changes when the source index changes", () => {
  const connectionA = buildIndexParentConnectionUuid({
    sourceIndexId: "11111111-1111-1111-1111-111111111111",
    targetIndexId: "22222222-2222-2222-2222-222222222222",
  });
  const connectionB = buildIndexParentConnectionUuid({
    sourceIndexId: "33333333-3333-3333-3333-333333333333",
    targetIndexId: "22222222-2222-2222-2222-222222222222",
  });

  if (!connectionA || !connectionB || connectionA === connectionB) {
    throw new Error("Expected different source indexes to produce different UUIDs.");
  }
});
