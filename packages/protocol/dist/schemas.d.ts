import { z } from "zod";
export declare const siteSchema: z.ZodObject<{
    id: z.ZodString;
    canonical_url: z.ZodNullable<z.ZodString>;
    title: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    image_url: z.ZodNullable<z.ZodString>;
    visibility: z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
    }>;
    protocol_version: z.ZodString;
    first_seen_at: z.ZodString;
    last_seen_at: z.ZodNullable<z.ZodString>;
    last_manifest_hash: z.ZodNullable<z.ZodString>;
    meta: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export declare const archiveSchema: z.ZodObject<{
    id: z.ZodString;
    owner_user_id: z.ZodNullable<z.ZodString>;
    slug: z.ZodString;
    title: z.ZodString;
    canonical_url: z.ZodNullable<z.ZodString>;
    availability_window_days: z.ZodNumber;
    default_ui_depth: z.ZodNumber;
    max_ui_depth: z.ZodNumber;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export declare const archiveSiteSchema: z.ZodObject<{
    archive_id: z.ZodString;
    site_id: z.ZodString;
    status: z.ZodEnum<{
        tracked: "tracked";
        delisted: "delisted";
    }>;
    delist_reason_code: z.ZodNullable<z.ZodString>;
    delist_note: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type Site = z.infer<typeof siteSchema>;
export type Archive = z.infer<typeof archiveSchema>;
export type ArchiveSite = z.infer<typeof archiveSiteSchema>;
