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
