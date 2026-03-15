const DEFAULT_SOLIDARY_ROOT_INDEX_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_SOLIDARY_APP_URL = "https://solidary.netlify.app";
const DEFAULT_SOLIDARY_ROOT_INDEX_LEVEL = 0;
const DEFAULT_SOLIDARY_ROOT_REPO_FULL_NAME = "SolidarySites/solidary";

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SOLIDARY_APP_URL;
  return trimmed.replace(/\/+$/, "");
};

export const getSolidaryRootIndexId = () =>
  (Deno.env.get("SOLIDARY_ROOT_INDEX_ID") ?? "").trim() ||
  DEFAULT_SOLIDARY_ROOT_INDEX_ID;

export const getSolidaryAppUrl = () =>
  normalizeUrl(Deno.env.get("SOLIDARY_APP_URL") ?? DEFAULT_SOLIDARY_APP_URL);

export const getSolidaryRootIndexUrl = () =>
  normalizeUrl(
    (Deno.env.get("SOLIDARY_ROOT_INDEX_URL") ?? "").trim() ||
      getSolidaryAppUrl(),
  );

export const getSolidaryRootIndexLevel = () => {
  const parsed = Number.parseInt(
    (Deno.env.get("SOLIDARY_ROOT_INDEX_LEVEL") ?? "").trim(),
    10,
  );
  return Number.isFinite(parsed) ? parsed : DEFAULT_SOLIDARY_ROOT_INDEX_LEVEL;
};

export const getDefaultChildIndexLevel = () => getSolidaryRootIndexLevel() + 1;

export const getSolidaryRootRepoFullName = () =>
  (Deno.env.get("SOLIDARY_ROOT_REPO_FULL_NAME") ?? "").trim() ||
  DEFAULT_SOLIDARY_ROOT_REPO_FULL_NAME;

export const getSolidaryRootRepoUrl = () => {
  const explicit = (Deno.env.get("SOLIDARY_ROOT_REPO_URL") ?? "").trim();
  if (explicit) {
    return explicit;
  }

  const repoFullName = getSolidaryRootRepoFullName();
  return repoFullName ? `https://github.com/${repoFullName}` : "";
};
