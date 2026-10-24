import { defineConfig, devices } from "@playwright/test";

// Set BASE_URL to test the live site instead of a local copy.
const liveUrl = process.env.BASE_URL;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  use: { baseURL: liveUrl ?? "http://localhost:8787" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: liveUrl
    ? undefined
    : {
        command: "npm run preview",
        url: "http://localhost:8787",
        reuseExistingServer: !process.env.CI,
      },
});
