/* vite.config.ts */

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
    rolldownOptions: {
      output: {
        // Libraries get their own chunks, so they load in parallel and stay
        // cached across app deploys. Each one still loads only where it's used.
        codeSplitting: {
          groups: [
            {
              name: "three",
              test: /[\\/]node_modules[\\/]three[\\/]/,
              priority: 30,
            },
            {
              name: "marked",
              test: /[\\/]node_modules[\\/]marked[\\/]/,
              priority: 20,
            },
            {
              name: "svelte",
              test: /[\\/]node_modules[\\/](svelte|esm-env|clsx)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
