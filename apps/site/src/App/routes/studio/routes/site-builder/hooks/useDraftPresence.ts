import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../../../../../lib/supabase";
import type { SiteAccessRole } from "../services/types";

type PresencePayload = {
  user_id?: string;
  name?: string;
  role?: SiteAccessRole | "viewer";
  active_page_slug?: string | null;
  at?: string;
};

type DraftPresenceMember = {
  userId: string;
  name: string;
  role: SiteAccessRole | null;
  activePageSlug: string | null;
};

type UseDraftPresenceParams = {
  draftId: string | null | undefined;
  sessionUserId: string | null;
  sessionDisplayName: string;
  siteAccessRole: SiteAccessRole | null;
  activePreviewSlug: string;
  surface: "builder" | "settings";
};

type UseDraftPresenceResult = {
  activePresenceMembers: DraftPresenceMember[];
};

export const useDraftPresence = ({
  draftId,
  sessionUserId,
  sessionDisplayName,
  siteAccessRole,
  activePreviewSlug,
  surface
}: UseDraftPresenceParams): UseDraftPresenceResult => {
  const [activePresenceMembers, setActivePresenceMembers] = useState<DraftPresenceMember[]>([]);
  const draftPresenceChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!draftId || !sessionUserId || !siteAccessRole) {
      void draftPresenceChannelRef.current?.unsubscribe();
      draftPresenceChannelRef.current = null;
      return;
    }

    const channel = supabase.channel(`draft-presence:${surface}:${draftId}`, {
      config: {
        presence: {
          key: sessionUserId
        }
      }
    });
    draftPresenceChannelRef.current = channel;

    const syncPresence = () => {
      const state = channel.presenceState<PresencePayload>();
      const membersByUserId = new Map<string, DraftPresenceMember>();

      Object.values(state)
        .flat()
        .forEach((payload) => {
          const userId = typeof payload.user_id === "string" ? payload.user_id.trim() : "";
          if (!userId) return;
          const roleValue =
            payload.role === "owner" ||
            payload.role === "admin" ||
            payload.role === "editor" ||
            payload.role === "contributor" ||
            payload.role === "viewer"
              ? payload.role === "viewer"
                ? "contributor"
                : payload.role
              : null;
          const existing = membersByUserId.get(userId);
          if (existing) return;
          membersByUserId.set(userId, {
            userId,
            role: roleValue,
            name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Unknown",
            activePageSlug:
              typeof payload.active_page_slug === "string" && payload.active_page_slug.trim()
                ? payload.active_page_slug
                : null
          });
        });

      setActivePresenceMembers(
        Array.from(membersByUserId.values()).sort((left, right) => left.name.localeCompare(right.name))
      );
    };

    channel.on("presence", { event: "sync" }, syncPresence);

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: sessionUserId,
        name: sessionDisplayName,
        role: siteAccessRole,
        active_page_slug: null,
        at: new Date().toISOString()
      } satisfies PresencePayload);
    });

    return () => {
      setActivePresenceMembers([]);
      if (draftPresenceChannelRef.current === channel) {
        draftPresenceChannelRef.current = null;
      }
      void channel.unsubscribe();
    };
  }, [draftId, sessionDisplayName, sessionUserId, siteAccessRole, surface]);

  useEffect(() => {
    const channel = draftPresenceChannelRef.current;
    if (!channel || !sessionUserId || !siteAccessRole) return;
    void channel.track({
      user_id: sessionUserId,
      name: sessionDisplayName,
      role: siteAccessRole,
      active_page_slug: activePreviewSlug,
      at: new Date().toISOString()
    } satisfies PresencePayload);
  }, [activePreviewSlug, sessionDisplayName, sessionUserId, siteAccessRole]);

  return {
    activePresenceMembers
  };
};
