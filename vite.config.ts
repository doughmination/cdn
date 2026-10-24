// Builds the viewer (web/) into dist/, which wrangler serves as static assets.
// public/ is copied in as-is.

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  publicDir: "../public",
  plugins: [svelte()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Kept under one reserved prefix so the bundle can't shadow a folder.
    assetsDir: "_app",
  },
});
