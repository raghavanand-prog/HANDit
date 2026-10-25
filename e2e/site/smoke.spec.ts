import { expect, test } from "@playwright/test";

test("the home page shows Send, Receive and the public-test label", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("HANDit");
  await expect(page.getByRole("heading", { name: "Hand your files to any device." })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Send/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Receive/ })).toBeVisible();
  await expect(page.getByText("Public test — not independently security-audited")).toBeVisible();
});

test("app paths load the app; /j without a code explains the link is damaged", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await page.goto("/j");
  await expect(page.getByRole("heading", { name: "This link doesn't work." })).toBeVisible();
});

test("every message code has a help page", async ({ page }) => {
  await page.goto("/help/P2P_FAILED");
  await expect(
    page.getByRole("heading", { name: "These devices couldn't connect directly." }),
  ).toBeVisible();
  await page.goto("/help/NOT_A_CODE");
  await expect(page.getByText("There's no help page for that.")).toBeVisible();
});

test("the Worker answers /ws/ paths and refuses bad room IDs", async ({ request }) => {
  // A room path needs a WebSocket upgrade, which a plain request doesn't have.
  expect((await request.get("/ws/0123456789abcdef0123456789abcdef")).status()).toBe(426);
  expect((await request.get("/ws/not-a-room")).status()).toBe(404);
});

test("a shared link previews well: title, description and a 1200x630 image", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const tag = (property: string) =>
    page.locator(`meta[property="${property}"], meta[name="${property}"]`).getAttribute("content");
  expect(await tag("og:title")).toContain("HANDit");
  expect((await tag("og:description"))?.length).toBeGreaterThan(60);
  expect(await tag("twitter:card")).toBe("summary_large_image");
  expect(await tag("og:image:width")).toBe("1200");
  expect(await tag("og:image:height")).toBe("630");
  // The image is on the official address, is a real PNG, and is the size it claims.
  const image = new URL((await tag("og:image")) ?? "");
  expect(image.origin).toBe("https://handit.handit-worker.workers.dev");
  const response = await request.get(image.pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const png = await response.body();
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});
