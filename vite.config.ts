// Builds the viewer (web/) into dist/, which wrangler serves as static assets.
// public/ is copied in as-is.

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  root: "web",
  publicDir: "../public",
  plugins: [
    svelte(),
    // Turns each `~icons/<set>/<name>` import into an inline-SVG Svelte component at build time
    Icons({
      compiler: "svelte",
      scale: 1,
    }),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Kept under one reserved prefix so the bundle can't shadow a folder.
    assetsDir: "_app",
  },
});
