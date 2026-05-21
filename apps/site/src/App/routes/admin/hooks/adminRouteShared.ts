import type { CollaboratorSearchResult } from "../../studio/routes/site-builder/services/types";
import type { StudioSettingsSection } from "../../studio/routes/site-settings/services/settings-sections";
import type { IndexAdminListItem, IndexAdminState } from "../services/types";

export const getFriendlyErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export const buildSearchParams = ({
  current,
  indexId,
  section,
  clearCreated = false
}: {
  current: URLSearchParams;
  indexId: string;
  section: StudioSettingsSection;
  clearCreated?: boolean;
}) => {
  const next = new URLSearchParams(current);
  next.set("indexId", indexId);
  next.set("section", section);
  if (clearCreated) {
    next.delete("created");
  }
  return next;
};

export const resetAdminFormFields = ({
  state,
  setTitle,
  setDescription,
  setDomainInput,
  setImageFile,
  setSelectedSuggestion,
  setSuggestions
}: {
  state: IndexAdminState;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setDomainInput: (value: string) => void;
  setImageFile: (value: File | null) => void;
  setSelectedSuggestion: (value: CollaboratorSearchResult | null) => void;
  setSuggestions: (value: CollaboratorSearchResult[]) => void;
}) => {
  setTitle(state.index.title);
  setDescription(state.index.description);
  setDomainInput(state.index.canonicalUrl);
  setImageFile(null);
  setSelectedSuggestion(null);
  setSuggestions([]);
};

export const buildIndexListItemFromState = (state: IndexAdminState): IndexAdminListItem => ({
  id: state.index.id,
  slug: state.index.slug,
  title: state.index.title,
  description: state.index.description,
  imageUrl: state.index.imageUrl,
  canonicalUrl: state.index.canonicalUrl,
  repoFullName: state.index.repoFullName,
  repoUrl: state.index.repoUrl,
  supabaseProjectRef: state.index.supabaseProjectRef,
  supabaseDashboardUrl: state.index.supabaseDashboardUrl,
  indexLevel: state.index.indexLevel,
  parentIndexId: state.index.parentIndexId,
  parentIndexUrl: state.index.parentIndexUrl,
  parentIndexLevel: state.index.parentIndexLevel,
  accessRole: state.actor.role
});
