import { defineConfig, devices } from "@playwright/test";

// Set BASE_URL to test the live site (and its Room) instead of a local copy.
const liveUrl = process.env.BASE_URL;
const siteUrl = liveUrl ?? "http://localhost:8787";
const reuse = !process.env.CI;
// Plain IP addresses instead of mDNS names, so two browsers on one machine can always connect.
const webrtcArgs = ["--disable-features=WebRtcHideLocalIpsWithMdns"];

export default defineConfig({
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  projects: [
    {
      name: "site",
      testDir: "e2e/site",
      use: { ...devices["Desktop Chrome"], baseURL: siteUrl, launchOptions: { args: webrtcArgs } },
    },
    {
      // Browser-level tests of web/src/core, loaded from the Vite dev server.
      name: "core",
      testDir: "e2e/core",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:5173",
        launchOptions: { args: webrtcArgs },
      },
    },
  ],
  webServer: [
    ...(liveUrl
      ? []
      : [
          // A fresh local Worker state each run, so earlier runs don't count towards the per-IP limits.
          {
            command: "npm run e2e:server",
            url: "http://localhost:8787",
            reuseExistingServer: reuse,
          },
        ]),
    {
      command: "npx vite --port 5173 --strictPort",
      cwd: "web",
      url: "http://localhost:5173",
      reuseExistingServer: reuse,
    },
  ],
});

/** Where the core tests find the Room. */
export const roomOrigin = siteUrl;
