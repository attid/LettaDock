import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// UI-DEV-1: short commit hash injected as __GIT_SHA__ (dev window title).
import { execSync } from "node:child_process";
const host = process.env.TAURI_DEV_HOST;

let gitSha = "dev";
try {
  gitSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  /* not a git repo (edge) */
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // UI-DEV-1: __GIT_SHA__ available to the frontend (window title marker).
  define: {
    __GIT_SHA__: JSON.stringify(gitSha),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
