import { defineCollection, z } from "astro:content";

const pages = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    navLabel: z.string().optional(),
    description: z.string().optional(),
    showInNav: z.boolean().default(true)
  })
});

export const collections = { pages };
