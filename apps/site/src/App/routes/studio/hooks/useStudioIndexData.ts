import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { NoticeKind } from "../../../types/notice";

export type StudioIndexItem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  canonicalUrl: string;
  repoFullName: string | null;
  repoUrl: string | null;
  supabaseProjectRef: string | null;
  supabaseDashboardUrl: string | null;
  updatedAt?: string;
};

type UseStudioIndexDataArgs = {
  session: Session | null;
  setNotice: (value: string | null) => void;
  setNoticeKind: (value: NoticeKind) => void;
};

type ArchiveRow = {
  id: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  canonical_url: string | null;
  repo_full_name: string | null;
  repo_url: string | null;
  supabase_project_ref: string | null;
  supabase_dashboard_url: string | null;
  updated_at: string | null;
};

export const useStudioIndexData = ({
  session,
  setNotice,
  setNoticeKind
}: UseStudioIndexDataArgs) => {
  const [items, setItems] = useState<StudioIndexItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    let mounted = true;

    const loadIndexes = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("archives")
        .select(
          [
            "id",
            "title",
            "slug",
            "description",
            "canonical_url",
            "repo_full_name",
            "repo_url",
            "supabase_project_ref",
            "supabase_dashboard_url",
            "updated_at"
          ].join(", ")
        )
        .eq("owner_user_id", session.user.id)
        .order("updated_at", { ascending: false });

      if (!mounted) {
        return;
      }

      if (error) {
        setNotice(error.message);
        setNoticeKind("error");
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = ((data ?? []) as unknown) as ArchiveRow[];
      setItems(
        rows.map((row) => ({
          id: typeof row.id === "string" ? row.id : "",
          title: typeof row.title === "string" ? row.title : "Untitled index",
          slug: typeof row.slug === "string" ? row.slug : "",
          description: typeof row.description === "string" ? row.description : "",
          canonicalUrl: typeof row.canonical_url === "string" ? row.canonical_url : "",
          repoFullName: typeof row.repo_full_name === "string" ? row.repo_full_name : null,
          repoUrl: typeof row.repo_url === "string" ? row.repo_url : null,
          supabaseProjectRef:
            typeof row.supabase_project_ref === "string" ? row.supabase_project_ref : null,
          supabaseDashboardUrl:
            typeof row.supabase_dashboard_url === "string" ? row.supabase_dashboard_url : null,
          updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
        }))
      );
      setLoading(false);
    };

    void loadIndexes();

    return () => {
      mounted = false;
    };
  }, [session, setNotice, setNoticeKind]);

  return {
    items: session ? items : [],
    loading: session ? loading : false
  };
};
