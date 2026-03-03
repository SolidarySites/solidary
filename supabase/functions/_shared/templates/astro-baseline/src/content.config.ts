import { defineCollection } from "astro:content";
import { pageSchema } from "./solidary-config/site";

const pages = defineCollection({
  type: "content",
  schema: pageSchema
});

export const collections = { pages };
