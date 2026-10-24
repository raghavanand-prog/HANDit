import { defineConfig, devices } from "@playwright/test";

// The release-gate size and speed cases (OQ8, E2, E3, E4): npm run bench. Not part of CI: they
// move gigabytes. Results are recorded by hand in docs/testing.md.
export default defineConfig({
  testDir: "e2e/bench",
  timeout: 30 * 60_000,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5173" },
  projects: [
    {
      name: "bench",
      use: {
        launchOptions: { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] },
      },
    },
  ],
  webServer: [
    {
      command: "npm run e2e:server",
      url: "http://localhost:8787",
      reuseExistingServer: true,
    },
    {
      command: "npx vite --port 5173 --strictPort",
      cwd: "web",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
  ],
});
