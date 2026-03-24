import { isIgnorableOwnerLookupErrorMessage } from "./index-public-network.ts";

Deno.test("isIgnorableOwnerLookupErrorMessage accepts auth schema exposure errors", () => {
  if (!isIgnorableOwnerLookupErrorMessage("Invalid schema: auth")) {
    throw new Error("Expected auth schema errors to be ignored for owner enrichment.");
  }

  if (
    !isIgnorableOwnerLookupErrorMessage(
      'The schema must be one of the following: public, storage. Received "auth".',
    )
  ) {
    throw new Error("Expected schema whitelist errors to be ignored for owner enrichment.");
  }
});

Deno.test("isIgnorableOwnerLookupErrorMessage rejects unrelated database errors", () => {
  if (isIgnorableOwnerLookupErrorMessage("relation \"auth.users\" does not exist")) {
    throw new Error("Unexpectedly ignored an unrelated owner lookup error.");
  }
});
