import { useEffect, useRef, useState } from "react";
import type { NoticeKind } from "../../../types/notice";
import type {
  CollaboratorRole,
  CollaboratorSearchResult
} from "../../studio/routes/site-builder/services/types";
import {
  removeIndexAdminCollaborator,
  saveIndexAdminCollaborator,
  searchIndexAdminCollaborators
} from "../services/index-admin";
import type { IndexAdminReadResponse, IndexAdminState } from "../services/types";
import { getFriendlyErrorMessage } from "./adminRouteShared";

type SetRouteNotice = (message: string | null, kind: NoticeKind) => void;

export const useAdminCollaborators = ({
  selectedArchiveId,
  state,
  bridgeToken,
  isBridgeMode,
  setRouteNotice,
  applyResponse
}: {
  selectedArchiveId: string;
  state: IndexAdminState | null;
  bridgeToken: string;
  isBridgeMode: boolean;
  setRouteNotice: SetRouteNotice;
  applyResponse: (
    response: IndexAdminReadResponse,
    options?: { resetFields?: boolean }
  ) => void;
}) => {
  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>("editor");
  const [collaboratorSuggestions, setCollaboratorSuggestions] = useState<CollaboratorSearchResult[]>(
    []
  );
  const [selectedCollaboratorSuggestion, setSelectedCollaboratorSuggestion] =
    useState<CollaboratorSearchResult | null>(null);
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false);
  const [updatingCollaboratorUserId, setUpdatingCollaboratorUserId] = useState<string | null>(null);
  const queryRequestIdRef = useRef(0);

  useEffect(() => {
    const query = collaboratorQuery.trim();
    if (!state?.actor.canManageCollaborators || query.length < 2 || !selectedArchiveId) {
      setCollaboratorSuggestions([]);
      setCollaboratorSearchLoading(false);
      return;
    }

    const requestId = ++queryRequestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      setCollaboratorSearchLoading(true);
      void (async () => {
        try {
          const response = await searchIndexAdminCollaborators({
            indexId: selectedArchiveId,
            query,
            bridgeToken: isBridgeMode ? bridgeToken : undefined
          });
          if (queryRequestIdRef.current !== requestId) {
            return;
          }
          setCollaboratorSuggestions(response.results);
        } catch (error) {
          if (queryRequestIdRef.current !== requestId) {
            return;
          }
          setCollaboratorSuggestions([]);
          setRouteNotice(getFriendlyErrorMessage(error, "Could not search collaborators."), "error");
        } finally {
          if (queryRequestIdRef.current === requestId) {
            setCollaboratorSearchLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [bridgeToken, collaboratorQuery, isBridgeMode, selectedArchiveId, setRouteNotice, state?.actor.canManageCollaborators]);

  const handleInviteCollaborator = async () => {
    if (!selectedArchiveId || !selectedCollaboratorSuggestion) return;
    setUpdatingCollaboratorUserId(selectedCollaboratorSuggestion.userId);
    try {
      const response = await saveIndexAdminCollaborator(
        {
          indexId: selectedArchiveId,
          collaboratorUserId: selectedCollaboratorSuggestion.userId,
          role: collaboratorRole
        },
        {
          bridgeToken: isBridgeMode ? bridgeToken : undefined
        }
      );
      applyResponse(response);
      setCollaboratorQuery("");
      setSelectedCollaboratorSuggestion(null);
      setRouteNotice("Collaborator added.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not add collaborator."), "error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleCollaboratorRoleUpdate = async (userId: string, role: CollaboratorRole) => {
    if (!selectedArchiveId) return;
    setUpdatingCollaboratorUserId(userId);
    try {
      const response = await saveIndexAdminCollaborator(
        {
          indexId: selectedArchiveId,
          collaboratorUserId: userId,
          role
        },
        {
          bridgeToken: isBridgeMode ? bridgeToken : undefined
        }
      );
      applyResponse(response);
      setRouteNotice("Collaborator role updated.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not update collaborator role."), "error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const handleCollaboratorRemove = async (userId: string) => {
    if (!selectedArchiveId) return;
    setUpdatingCollaboratorUserId(userId);
    try {
      const response = await removeIndexAdminCollaborator(
        {
          indexId: selectedArchiveId,
          collaboratorUserId: userId
        },
        {
          bridgeToken: isBridgeMode ? bridgeToken : undefined
        }
      );
      applyResponse(response);
      setRouteNotice("Collaborator removed.", "notice");
    } catch (error) {
      setRouteNotice(getFriendlyErrorMessage(error, "Could not remove collaborator."), "error");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  return {
    collaboratorQuery,
    collaboratorRole,
    collaboratorSuggestions,
    selectedCollaboratorSuggestion,
    collaboratorSearchLoading,
    updatingCollaboratorUserId,
    setCollaboratorQuery,
    setCollaboratorRole,
    setCollaboratorSuggestions,
    setSelectedCollaboratorSuggestion,
    handleInviteCollaborator,
    handleCollaboratorRoleUpdate,
    handleCollaboratorRemove
  };
};
