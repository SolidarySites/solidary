/// <reference types="vite/client" />

declare const __SOLIDARY_PROJECT_ID__: string;
declare const __SOLIDARY_SUPABASE_URL__: string;
declare const __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__: string;

interface ImportMetaEnv {
  readonly VITE_GITHUB_TOKEN_DEBUG?: string;
  readonly VITE_SOLIDARY_ROOT_INDEX_ID?: string;
  readonly SOLIDARY_PROJECT_ID?: string;
  readonly SOLIDARY_PUBLISHABLE_KEY?: string;
}
