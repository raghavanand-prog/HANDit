import { defineConfig, devices } from "@playwright/test";
import { FAKE_CAMERA, showCode } from "./e2e/scanner/camera";

// Set BASE_URL to test the live site instead of a local copy (npm run test:e2e:live). Only the
// site and scanner suites run against it: the core suite loads its pages from the dev server's
// origin, which the live Room refuses by design (the origin check).
const liveUrl = process.env.BASE_URL;
const siteUrl = liveUrl ?? "http://localhost:8787";
const reuse = !process.env.CI;
// Plain IP addresses instead of mDNS names, so two browsers on one machine can always connect.
const webrtcArgs = ["--disable-features=WebRtcHideLocalIpsWithMdns"];
showCode(null); // the fake webcam starts out seeing an empty screen
const cameraArgs = [
  ...webrtcArgs,
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  `--use-file-for-fake-video-capture=${FAKE_CAMERA}`,
];

export default defineConfig({
  forbidOnly: !!process.env.CI,
  // On CI's shared machines a 1 GiB transfer starves other WebRTC tests, so run one at a time.
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  projects: [
    {
      // The QR decoder in each major browser engine (spike for the in-page scanner).
      name: "engines-chromium",
      testDir: "e2e/engines",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5173" },
    },
    {
      name: "engines-firefox",
      testDir: "e2e/engines",
      use: { ...devices["Desktop Firefox"], baseURL: "http://localhost:5173" },
    },
    {
      name: "engines-webkit",
      testDir: "e2e/engines",
      use: { ...devices["Desktop Safari"], baseURL: "http://localhost:5173" },
    },
    {
      name: "site",
      testDir: "e2e/site",
      use: { ...devices["Desktop Chrome"], baseURL: siteUrl, launchOptions: { args: webrtcArgs } },
    },
    {
      // The in-page scanner, with a fake webcam that shows a QR code of our choosing.
      name: "scanner",
      testDir: "e2e/scanner",
      use: { ...devices["Desktop Chrome"], baseURL: siteUrl, launchOptions: { args: cameraArgs } },
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
