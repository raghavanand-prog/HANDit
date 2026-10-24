import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

// T-18: HANDit installs (Android and desktop) and works as an app shell. The service worker
// caches only the page shell: never a WebSocket, never a POST, never received files.
test("the app is installable: a valid manifest, icons and a service worker", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestUrl).toBe("/manifest.webmanifest");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    name: "HANDit",
    short_name: "HANDit",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  const sizes = manifest.icons.map(
    (icon: { sizes: string; purpose?: string }) => `${icon.sizes}:${icon.purpose ?? "any"}`,
  );
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status()).toBe(200);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Chromium's own installability check: no errors means the browser would offer to install it.
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});

test("the service worker caches only the page shell", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await page.goto("/how-it-works");
  await page.evaluate(() => fetch("/ws/0123456789abcdef0123456789abcdef").catch(() => null));
  await page.waitForTimeout(500);

  const cached = await page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    }
    return out;
  });
  const names = Object.keys(cached);
  expect(names).toEqual(["handit-shell-v1"]);
  const paths = cached["handit-shell-v1"] ?? [];
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(path, path).toMatch(/^\/($|assets\/|icon-|apple-touch-icon|favicon|manifest)/);
    expect(path).not.toMatch(/^\/(ws|share-target|__share)/);
  }
});

test("offline, the app opens and says it can't reach HANDit", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto("/receive");
  await expect(page.getByRole("heading", { name: "Couldn't reach HANDit." })).toBeVisible();
  await expect(
    page.getByText("Check that this device is connected to the internet, then try again."),
  ).toBeVisible();
  await context.setOffline(false);
});

test("sharing files into the installed app opens Send with them ready (Android share target)", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();

  // What Android does when you share from the gallery: POST the files to the share target.
  const sharedUrl = await page.evaluate(async () => {
    const form = new FormData();
    form.append(
      "files",
      new File([new Uint8Array(1500).fill(7)], "IMG_0042.HEIC", { type: "image/heic" }),
    );
    form.append("files", new File(["notes"], "notes.txt", { type: "text/plain" }));
    const response = await fetch("/share-target", { method: "POST", body: form });
    return response.url;
  });
  expect(new URL(sharedUrl).pathname).toBe("/send");
  await page.goto(sharedUrl);
  await expect(page.getByText("2 items · 1.5 KB")).toBeVisible();
  await expect(page.getByText("IMG_0042.HEIC")).toBeVisible();
  await expect(page).toHaveURL(/\/send$/); // the hand-off id is gone from the address
  // The hand-off copy was deleted as soon as the page took the files.
  const leftovers = await page.evaluate(
    async () => (await (await caches.open("handit-share")).keys()).length,
  );
  expect(leftovers).toBe(0);
});

test("a transfer started from a shared file works end to end", async ({ browser }) => {
  const sender = await (await browser.newContext()).newPage();
  const phone = await (await browser.newContext()).newPage();
  await sender.goto("/");
  await sender.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await sender.reload();
  const buffer = randomBytes(300_000);
  const url = await sender.evaluate(
    async (bytes) => {
      const form = new FormData();
      form.append(
        "files",
        new File([new Uint8Array(bytes)], "shared.bin", { type: "application/octet-stream" }),
      );
      return (await fetch("/share-target", { method: "POST", body: form })).url;
    },
    [...buffer],
  );
  await sender.goto(url);
  await sender.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await sender.getByRole("button", { name: "Show code" }).click();
  await sender.getByRole("button", { name: "Copy link" }).click();
  await phone.goto(await sender.evaluate(() => navigator.clipboard.readText()));
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  await phone.getByRole("button", { name: "Accept" }).click();
  await expect(phone.getByText("Original quality · Identical ✓")).toBeVisible();
});
