import { z } from "zod";

export const siteSchema = z.object({
  id: z.string().uuid(),
  canonical_url: z.string().url().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  visibility: z.enum(["public", "unlisted", "private"]),
  protocol_version: z.string(),
  first_seen_at: z.string(),
  last_seen_at: z.string().nullable(),
  last_manifest_hash: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string()
});

export const archiveSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid().nullable(),
  slug: z.string(),
  title: z.string(),
  canonical_url: z.string().nullable(),
  availability_window_days: z.number(),
  default_ui_depth: z.number(),
  max_ui_depth: z.number(),
  created_at: z.string(),
  updated_at: z.string()
});

export const archiveSiteSchema = z.object({
  archive_id: z.string().uuid(),
  site_id: z.string().uuid(),
  status: z.enum(["tracked", "delisted"]),
  delist_reason_code: z.string().nullable(),
  delist_note: z.string().nullable(),
  created_at: z.string()
});

export type Site = z.infer<typeof siteSchema>;
export type Archive = z.infer<typeof archiveSchema>;
export type ArchiveSite = z.infer<typeof archiveSiteSchema>;
