import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getFreshGithubAuthSnapshot,
  requireFreshGithubAuth
} from "../../../../../features/auth/services/github-auth";
import {
  mapCollaboratorSearchRows,
  mapManagedCollaboratorRows,
  normalizeCollaboratorIdentifier,
  type CollaboratorSearchRpcRow,
  type ManagedCollaboratorApiRow
} from "../services/collaborators";
import type {
  CollaboratorRole,
  CollaboratorSearchResult,
  ManagedCollaborator
} from "../services/types";
import { supabase } from "../../../../../lib/supabase";
import type { NoticeKind } from "../../../../../types/notice";

type UseBuilderCollaboratorsParams = {
  draftId: string | null;
  isOwnerOnOwnerDraft: boolean;
  session: Session | null;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

export const useBuilderCollaborators = ({
  draftId,
  isOwnerOnOwnerDraft,
  session,
  setNotice,
  setNoticeKind
}: UseBuilderCollaboratorsParams) => {
  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>("editor");
  const [collaboratorSuggestions, setCollaboratorSuggestions] = useState<CollaboratorSearchResult[]>([]);
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false);
  const [invitingCollaborator, setInvitingCollaborator] = useState(false);
  const [selectedCollaboratorSuggestion, setSelectedCollaboratorSuggestion] =
    useState<CollaboratorSearchResult | null>(null);
  const [managedCollaborators, setManagedCollaborators] = useState<ManagedCollaborator[]>([]);
  const [managedCollaboratorsLoading, setManagedCollaboratorsLoading] = useState(false);
  const [updatingCollaboratorUserId, setUpdatingCollaboratorUserId] = useState<string | null>(null);

  const resetCollaborators = useCallback(() => {
    setCollaboratorQuery("");
    setCollaboratorSuggestions([]);
    setSelectedCollaboratorSuggestion(null);
    setManagedCollaborators([]);
    setManagedCollaboratorsLoading(false);
    setUpdatingCollaboratorUserId(null);
  }, []);

  const loadManagedCollaborators = useCallback(async (options?: { syncRoles?: boolean }) => {
    if (!draftId || !isOwnerOnOwnerDraft) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }

    if (!session) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }

    let supabaseAccessToken = "";
    try {
      const freshAuth = await getFreshGithubAuthSnapshot();
      supabaseAccessToken = freshAuth.supabaseAccessToken;
    } catch {
      supabaseAccessToken = "";
    }

    if (!supabaseAccessToken) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }

    const syncRoles = options?.syncRoles !== false;

    setManagedCollaboratorsLoading(true);
    try {
      const response = await fetch("/.netlify/functions/github-list-collaborators", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${supabaseAccessToken}`
        },
        body: JSON.stringify({
          draftId,
          syncRoles
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        collaborators?: ManagedCollaboratorApiRow[];
        error?: string;
      };
      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to load collaborators.";
        throw new Error(message);
      }

      setManagedCollaborators(mapManagedCollaboratorRows(payload.collaborators));
    } catch (caught) {
      setManagedCollaborators([]);
      const message =
        caught instanceof Error ? caught.message : "Failed to load collaborators.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setManagedCollaboratorsLoading(false);
    }
  }, [draftId, isOwnerOnOwnerDraft, session, setNotice, setNoticeKind]);

  useEffect(() => {
    if (!isOwnerOnOwnerDraft || !draftId) {
      setManagedCollaborators([]);
      setManagedCollaboratorsLoading(false);
      return;
    }
    void loadManagedCollaborators();
  }, [draftId, isOwnerOnOwnerDraft, loadManagedCollaborators]);

  useEffect(() => {
    if (!isOwnerOnOwnerDraft || !draftId) {
      setCollaboratorSuggestions([]);
      setCollaboratorSearchLoading(false);
      return;
    }

    const query = collaboratorQuery.trim();
    if (query.length < 2) {
      setCollaboratorSuggestions([]);
      setCollaboratorSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setCollaboratorSearchLoading(true);
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("site_search_collaborator_candidates", {
            p_draft_id: draftId,
            p_query: query,
            p_limit: 10
          });

          if (cancelled) return;
          if (error) {
            setCollaboratorSuggestions([]);
            return;
          }

          const suggestions = mapCollaboratorSearchRows((data ?? []) as CollaboratorSearchRpcRow[]);
          setCollaboratorSuggestions(suggestions.slice(0, 10));
        } finally {
          if (!cancelled) {
            setCollaboratorSearchLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [collaboratorQuery, draftId, isOwnerOnOwnerDraft]);

  const handleCollaboratorQueryChange = (value: string) => {
    setCollaboratorQuery(value);
    setSelectedCollaboratorSuggestion(null);
  };

  const handleCollaboratorSuggestionSelect = (suggestion: CollaboratorSearchResult) => {
    setSelectedCollaboratorSuggestion(suggestion);
    setCollaboratorQuery(suggestion.githubLogin ? `@${suggestion.githubLogin}` : suggestion.email);
    setCollaboratorSuggestions([]);
  };

  const handleInviteCollaborator = async () => {
    if (!draftId) return;
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only owners can invite collaborators.");
      setNoticeKind("error");
      return;
    }

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshGithubAuth();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const { supabaseAccessToken } = freshAuth;
    const identifierInput = collaboratorQuery.trim();
    if (!identifierInput) {
      setNotice("Enter a GitHub username or email.");
      setNoticeKind("error");
      return;
    }

    const normalizedIdentifier = normalizeCollaboratorIdentifier(identifierInput);
    if (!normalizedIdentifier) {
      setNotice("Enter a valid GitHub username or email.");
      setNoticeKind("error");
      return;
    }

    let selectedSuggestion =
      selectedCollaboratorSuggestion &&
      (normalizedIdentifier.toLowerCase() === selectedCollaboratorSuggestion.email.toLowerCase() ||
        normalizedIdentifier.toLowerCase() ===
          (selectedCollaboratorSuggestion.githubLogin ?? "").toLowerCase())
        ? selectedCollaboratorSuggestion
        : (collaboratorSuggestions.find(
            (suggestion) =>
              normalizedIdentifier.toLowerCase() === suggestion.email.toLowerCase() ||
              normalizedIdentifier.toLowerCase() === (suggestion.githubLogin ?? "").toLowerCase()
          ) ?? null);

    setInvitingCollaborator(true);
    try {
      if (!selectedSuggestion && normalizedIdentifier.includes("@")) {
        const { data, error } = await supabase.rpc("site_search_collaborator_candidates", {
          p_draft_id: draftId,
          p_query: normalizedIdentifier,
          p_limit: 10
        });

        if (!error) {
          const exactEmailMatch = mapCollaboratorSearchRows((data ?? []) as CollaboratorSearchRpcRow[]).find(
            (suggestion) => suggestion.email.toLowerCase() === normalizedIdentifier.toLowerCase()
          );
          if (exactEmailMatch) {
            selectedSuggestion = exactEmailMatch;
            setSelectedCollaboratorSuggestion(exactEmailMatch);
          }
        }
      }

      const response = await fetch("/.netlify/functions/github-invite-collaborator", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${supabaseAccessToken}`
        },
        body: JSON.stringify({
          draftId,
          identifier: normalizedIdentifier,
          role: collaboratorRole,
          solidaryUserId: selectedSuggestion?.userId ?? null,
          solidaryGithubLogin: selectedSuggestion?.githubLogin ?? null
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to send collaborator invite.";
        throw new Error(message);
      }

      const invitedLabel =
        typeof payload?.target === "string" && payload.target.trim()
          ? payload.target.trim()
          : normalizedIdentifier;
      setNotice(`Invite sent to ${invitedLabel}.`);
      setNoticeKind("notice");
      setCollaboratorQuery("");
      setCollaboratorSuggestions([]);
      setSelectedCollaboratorSuggestion(null);
      await loadManagedCollaborators({ syncRoles: false });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to invite collaborator.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setInvitingCollaborator(false);
    }
  };

  const handleCollaboratorRoleUpdate = async (
    collaboratorUserId: string,
    role: CollaboratorRole
  ) => {
    if (!draftId || !isOwnerOnOwnerDraft) return;
    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshGithubAuth();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const { supabaseAccessToken } = freshAuth;
    const collaborator = managedCollaborators.find((entry) => entry.userId === collaboratorUserId);
    if (!collaborator || collaborator.role === role) return;

    setUpdatingCollaboratorUserId(collaboratorUserId);
    try {
      const response = await fetch("/.netlify/functions/github-manage-collaborator", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${supabaseAccessToken}`
        },
        body: JSON.stringify({
          action: "update_role",
          draftId,
          collaboratorUserId,
          role
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to update collaborator role.";
        throw new Error(message);
      }

      setManagedCollaborators((current) =>
        current.map((entry) =>
          entry.userId === collaboratorUserId
            ? {
                ...entry,
                role,
                syncState: "unknown"
              }
            : entry
        )
      );
      setNotice(`Updated ${collaborator.displayName}'s role to ${role}.`);
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to update collaborator role.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleCollaboratorRemove = async (collaboratorUserId: string) => {
    if (!draftId || !isOwnerOnOwnerDraft) return;
    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    let freshAuth;
    try {
      freshAuth = await requireFreshGithubAuth();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
      setNotice(message);
      setNoticeKind("error");
      return;
    }

    const { supabaseAccessToken } = freshAuth;
    const collaborator = managedCollaborators.find((entry) => entry.userId === collaboratorUserId);
    if (!collaborator) return;

    setUpdatingCollaboratorUserId(collaboratorUserId);
    try {
      const response = await fetch("/.netlify/functions/github-manage-collaborator", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${supabaseAccessToken}`
        },
        body: JSON.stringify({
          action: "remove",
          draftId,
          collaboratorUserId
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Failed to remove collaborator.";
        throw new Error(message);
      }

      setManagedCollaborators((current) =>
        current.filter((entry) => entry.userId !== collaboratorUserId)
      );
      setNotice(`Removed ${collaborator.displayName} from this site.`);
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to remove collaborator.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  return {
    collaboratorQuery,
    collaboratorRole,
    collaboratorSuggestions,
    collaboratorSearchLoading,
    invitingCollaborator,
    selectedCollaboratorSuggestion,
    managedCollaborators,
    managedCollaboratorsLoading,
    updatingCollaboratorUserId,
    setCollaboratorRole,
    handleCollaboratorQueryChange,
    handleCollaboratorSuggestionSelect,
    handleInviteCollaborator,
    handleCollaboratorRoleUpdate,
    handleCollaboratorRemove,
    resetCollaborators
  };
};
