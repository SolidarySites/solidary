import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const envDir = fileURLToPath(new URL("../..", import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const supabasePublishableKey =
    env.SB_PUBLISHABLE_KEY?.trim() ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";

  return {
    envDir,
    define: {
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
