import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTextFile } from "./github";

vi.mock("../features/auth/services/github-auth", () => ({
  requireFreshSupabaseAuth: vi.fn(async () => ({
    session: {} as never,
    providerToken: "",
    supabaseAccessToken: "supabase-token"
  }))
}));

vi.mock("../lib/supabase", () => ({
  supabaseFunctionUrl: (functionName: string) => `https://example.supabase.co/functions/v1/${functionName}`
}));

describe("GitHub contents service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes base64 file content as UTF-8", async () => {
    const content = "café 🚀 — solidarité";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          encoding: "base64",
          content: Buffer.from(content, "utf8").toString("base64")
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(readTextFile("", "owner", "repo", "content.md", "main")).resolves.toBe(content);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/github-contents-read",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer supabase-token" })
      })
    );
  });
});
