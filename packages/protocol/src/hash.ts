export async function sha256(input: string) {
  if (typeof crypto !== "undefined" && "subtle" in crypto) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const nodeCrypto = await import("node:crypto");
  return nodeCrypto.createHash("sha256").update(input).digest("hex");
}
