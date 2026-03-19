import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const envDir = fileURLToPath(new URL("../..", import.meta.url));
const readEnv = (value: string | undefined) => value?.trim() ?? "";
const deriveProjectIdFromUrl = (supabaseUrl: string) => {
  const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  return match?.[1]?.trim() ?? "";
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const explicitSupabaseUrl =
    readEnv(env.SUPABASE_URL);
  const projectId =
    readEnv(env.SOLIDARY_PROJECT_ID) ||
    readEnv(env.VITE_SUPABASE_PROJECT_ID) ||
    deriveProjectIdFromUrl(explicitSupabaseUrl);
  const supabasePublishableKey =
    readEnv(env.SOLIDARY_PUBLISHABLE_KEY) ||
    readEnv(env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    "";
  const supabaseUrl =
    explicitSupabaseUrl ||
    (projectId ? `https://${projectId}.supabase.co` : "");

  return {
    envDir,
    define: {
      __SOLIDARY_PROJECT_ID__: JSON.stringify(projectId),
      __SOLIDARY_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __SOLIDARY_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(
        supabasePublishableKey,
      ),
    },
    css: {
      transformer: "lightningcss",
    },
    build: {
      cssMinify: "lightningcss",
    },
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
  };
});
