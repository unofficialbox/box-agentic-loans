import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // box-ui-elements and its @box/* dependencies use extensionless ESM imports that
    // Vite's bundler resolves but Vitest's node resolver does not. Inlining routes them
    // through the same transform pipeline the build uses.
    server: {
      deps: {
        inline: [/box-ui-elements/, /@box\//, /@salesforce\/platform-sdk/, /o11y/],
      },
    },
  },
});
