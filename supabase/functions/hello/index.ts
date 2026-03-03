import { runHandler } from "../_shared/request-adapter.ts";
import type { Handler } from "../_shared/types.ts";

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ok: true,
      message: "hello from solidary-links"
    })
  };
};


Deno.serve((request) => runHandler(request, handler));
