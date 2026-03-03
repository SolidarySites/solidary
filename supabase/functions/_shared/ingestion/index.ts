export type IngestPayload = {
  source: "github" | "manual";
  repoUrl?: string;
  content: string;
};

export function normalizeIngestPayload(payload: IngestPayload) {
  return {
    ...payload,
    content: payload.content.trim()
  };
}
