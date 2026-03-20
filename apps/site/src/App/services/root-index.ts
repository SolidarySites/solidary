import { supabase } from "../lib/supabase";

export type RootIndexRow = {
  id: string;
  canonical_url: string | null;
  index_level: number | null;
};

type RootIndexFederationStateResponse = {
  index?: {
    id?: string;
    canonical_url?: string | null;
    index_level?: number | null;
  } | null;
};

const DEFAULT_SOLIDARY_ROOT_INDEX_ID = "00000000-0000-4000-8000-000000000001";

const readConfiguredRootIndexId = () => {
  const explicitRootIndexId =
    typeof import.meta.env.VITE_SOLIDARY_ROOT_INDEX_ID === "string"
      ? import.meta.env.VITE_SOLIDARY_ROOT_INDEX_ID.trim()
      : "";
  return explicitRootIndexId || DEFAULT_SOLIDARY_ROOT_INDEX_ID;
};

export const getConfiguredRootIndexId = () => readConfiguredRootIndexId();

export const loadRootIndex = async (): Promise<RootIndexRow> => {
  const { data, error } = await supabase.rpc("rpc_index_federation_state");

  if (error) {
    throw new Error(error.message);
  }

  const rootIndex = (data as RootIndexFederationStateResponse | null)?.index;
  const rootIndexId = typeof rootIndex?.id === "string" ? rootIndex.id.trim() : "";
  const rootIndexCanonicalUrl =
    typeof rootIndex?.canonical_url === "string" && rootIndex.canonical_url.trim()
      ? rootIndex.canonical_url.trim()
      : null;

  if (!rootIndexId) {
    throw new Error("Root index is missing.");
  }

  if (!rootIndexCanonicalUrl) {
    throw new Error("Root index canonical URL is missing.");
  }

  return {
    id: rootIndexId,
    canonical_url: rootIndexCanonicalUrl,
    index_level: typeof rootIndex?.index_level === "number" ? rootIndex.index_level : null
  };
};

export const resolveRootIndexId = async () => {
  try {
    const rootIndex = await loadRootIndex();
    return rootIndex.id;
  } catch {
    return readConfiguredRootIndexId();
  }
};
