import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import salesforce from "@salesforce/vite-plugin-ui-bundle";
import { boxPreviewAssets } from "./vite.box-preview-assets";
import { liveBoxToken } from "./vite.live-box";

export default defineConfig(({ command, mode }) => ({
  base: "./",
  plugins: [
    react(),
    boxPreviewAssets(),
    ...(command === "build" && mode !== "standalone" ? [salesforce()] : []),
    // `--mode live` serves a real downscoped Box token at the Apex path so localhost
    // exercises the live Box branch. Dev-only; never part of a build.
    ...(mode === "live" ? [liveBoxToken()] : []),
  ],
  // Some box-ui-elements dependencies (draft-js and friends) reference the Node `global`.
  // Browsers do not define it, and without this the app throws before React mounts.
  define: {
    global: "globalThis",
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
}));
