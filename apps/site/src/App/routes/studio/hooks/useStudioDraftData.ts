import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { RepoFileSet } from "../../../features/site-draft/types";
import type { NoticeKind } from "../../../types/notice";
import type { DraftItem, StudioAccessRole } from "../services/studio-types";

type UseStudioDraftDataParams = {
  session: Session | null;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

type CollaboratorMembershipRow = {
  site_id: string;
  role: StudioAccessRole | null;
};

type SharedDraftRow = {
  id: string;
  site_id: string | null;
  repo_full_name: string;
  branch: string;
  files: RepoFileSet;
  owner_user_id: string;
  updated_at?: string;
};

export const useStudioDraftData = ({
  session,
  setNotice,
  setNoticeKind
}: UseStudioDraftDataParams) => {
  const [ownedDraftItems, setOwnedDraftItems] = useState<DraftItem[]>([]);
  const [sharedDraftItems, setSharedDraftItems] = useState<DraftItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

  useEffect(() => {
    if (!session) {
      setOwnedDraftItems([]);
      setSharedDraftItems([]);
      return;
    }

    let mounted = true;
    const loadDrafts = async () => {
      setDraftsLoading(true);
      try {
        const { data: ownedData, error: ownedError } = await supabase
          .from("site_drafts")
          .select("id, site_id, repo_full_name, branch, files, updated_at, owner_user_id")
          .eq("owner_user_id", session.user.id)
          .eq("draft_type", "owner")
          .order("updated_at", { ascending: false });

        if (!mounted) return;
        if (ownedError) {
          setNotice(ownedError.message);
          setNoticeKind("error");
          return;
        }

        const ownedItems = (ownedData ?? []).map((row) => ({
          id: (row.site_id as string | null) ?? row.id,
          site_id: (row.site_id as string | null) ?? row.id,
          repo_full_name: row.repo_full_name,
          branch: row.branch,
          files: row.files as RepoFileSet,
          owner_user_id: row.owner_user_id,
          access_role: "owner" as const,
          updated_at: row.updated_at
        }));
        setOwnedDraftItems(ownedItems);

        const { data: collaboratorMemberships, error: collaboratorError } = await supabase
          .from("site_admins")
          .select("site_id, role")
          .eq("user_id", session.user.id);

        if (!mounted) return;
        if (collaboratorError) {
          setNotice(collaboratorError.message);
          setNoticeKind("error");
          return;
        }

        const sharedMemberships = (collaboratorMemberships ?? []).filter(
          (membership): membership is CollaboratorMembershipRow =>
            Boolean(membership.site_id) &&
            (membership.role === "admin" ||
              membership.role === "editor" ||
              membership.role === "viewer")
        );

        const providerToken = (session as { provider_token?: string } | null)?.provider_token?.trim() ?? "";
        let resolvedSharedMemberships = sharedMemberships;

        if (providerToken) {
          const adminMemberships = sharedMemberships.filter((membership) => membership.role === "admin");
          if (adminMemberships.length) {
            const syncResults = await Promise.all(
              adminMemberships.map(async (membership) => {
                try {
                  const response = await fetch("/.netlify/functions/sync-admin-role-from-github", {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                      siteId: membership.site_id,
                      githubToken: providerToken
                    })
                  });
                  const payload = (await response.json().catch(() => ({}))) as {
                    role?: StudioAccessRole | null;
                    demoted?: boolean;
                  };
                  if (!response.ok) {
                    return membership;
                  }
                  if (payload.demoted && payload.role === "editor") {
                    return {
                      ...membership,
                      role: "editor" as const
                    };
                  }
                  return membership;
                } catch {
                  return membership;
                }
              })
            );

            const roleOverrideBySiteId = new Map<string, StudioAccessRole>();
            syncResults.forEach((entry) => {
              if (entry.role === "admin" || entry.role === "editor" || entry.role === "viewer") {
                roleOverrideBySiteId.set(entry.site_id, entry.role);
              }
            });
            resolvedSharedMemberships = sharedMemberships.map((membership) => ({
              ...membership,
              role: roleOverrideBySiteId.get(membership.site_id) ?? membership.role
            }));
          }
        }

        const ownedDraftIds = new Set(ownedItems.map((item) => item.id));
        const sharedDraftIds = Array.from(
          new Set(
            resolvedSharedMemberships
              .map((membership) => membership.site_id)
              .filter((siteId) => !ownedDraftIds.has(siteId))
          )
        );

        const roleBySiteId = new Map<string, StudioAccessRole>();
        resolvedSharedMemberships.forEach((membership) => {
          if (membership.role === "admin" || membership.role === "editor" || membership.role === "viewer") {
            roleBySiteId.set(membership.site_id, membership.role);
          }
        });

        let sharedData: SharedDraftRow[] = [];
        if (sharedDraftIds.length) {
          const { data, error: sharedError } = await supabase
            .from("site_drafts")
            .select("id, site_id, repo_full_name, branch, files, updated_at, owner_user_id")
            .in("site_id", sharedDraftIds)
            .eq("draft_type", "owner")
            .order("updated_at", { ascending: false });

          if (!mounted) return;
          if (sharedError) {
            setNotice(sharedError.message);
            setNoticeKind("error");
            return;
          }
          sharedData = (data ?? []) as SharedDraftRow[];
        }

        const mappedSharedItems = (sharedData ?? []).map((row) => ({
          id: (row.site_id as string | null) ?? row.id,
          site_id: (row.site_id as string | null) ?? row.id,
          repo_full_name: row.repo_full_name,
          branch: row.branch,
          files: row.files as RepoFileSet,
          owner_user_id: row.owner_user_id,
          access_role: roleBySiteId.get((row.site_id as string | null) ?? row.id) ?? "viewer",
          updated_at: row.updated_at
        }));
        setSharedDraftItems(mappedSharedItems);
      } finally {
        if (mounted) setDraftsLoading(false);
      }
    };

    void loadDrafts();

    return () => {
      mounted = false;
    };
  }, [session, setNotice, setNoticeKind]);

  return {
    ownedDraftItems,
    sharedDraftItems,
    draftsLoading,
    setOwnedDraftItems
  };
};
