export type Site = {
  id: string;
  canonical_url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  visibility: "public" | "unlisted" | "private";
  protocol_version: string;
  first_seen_at: string;
  last_seen_at: string | null;
  last_manifest_hash: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Archive = {
  id: string;
  owner_user_id: string | null;
  slug: string;
  title: string;
  canonical_url: string | null;
  availability_window_days: number;
  default_ui_depth: number;
  max_ui_depth: number;
  created_at: string;
  updated_at: string;
};

export type ArchiveSite = {
  archive_id: string;
  site_id: string;
  status: "tracked" | "delisted";
  delist_reason_code: string | null;
  delist_note: string | null;
  created_at: string;
};
