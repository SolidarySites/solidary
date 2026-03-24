type SupabaseClientLike = any;

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const resolveLocalConnectionSiteActorUserId = async ({
  supabase,
  siteId,
}: {
  supabase: SupabaseClientLike;
  siteId: string;
}) => {
  const normalizedSiteId = toTrimmedString(siteId);
  if (!normalizedSiteId) {
    return null;
  }

  const { data, error } = await supabase
    .from("site_drafts")
    .select("owner_user_id")
    .eq("site_id", normalizedSiteId)
    .eq("draft_type", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return toTrimmedString((data as { owner_user_id?: string | null } | null)?.owner_user_id) ||
    null;
};

export const syncLocalConnectionSiteLinksIfPresent = async ({
  supabase,
  siteId,
}: {
  supabase: SupabaseClientLike;
  siteId: string | null | undefined;
}) => {
  const normalizedSiteId = toTrimmedString(siteId);
  if (!normalizedSiteId) {
    return false;
  }

  const actorUserId = await resolveLocalConnectionSiteActorUserId({
    supabase,
    siteId: normalizedSiteId,
  });
  if (!actorUserId) {
    return false;
  }

  const { error } = await supabase.rpc("connection_sync_site_links_internal", {
    p_site_id: normalizedSiteId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    throw new Error(error.message);
  }

  return true;
};
