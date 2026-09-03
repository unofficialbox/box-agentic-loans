import { defineConfig, devices } from "@playwright/test";

const port = 5176;

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx serve dist -s -l ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
