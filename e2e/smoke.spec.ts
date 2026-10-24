import { expect, test } from "@playwright/test";

test("the home page shows Send, Receive and the public-test label", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("HANDit");
  await expect(page.getByRole("heading", { name: "HANDit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Receive" })).toBeVisible();
  await expect(page.getByText("Public test — not independently security-audited")).toBeVisible();
});

test("app paths such as /j load the app", async ({ page }) => {
  await page.goto("/j");
  await expect(page.getByRole("heading", { name: "HANDit" })).toBeVisible();
});

test("the Worker answers /ws/ paths and refuses bad room IDs", async ({ request }) => {
  // A room path needs a WebSocket upgrade, which a plain request doesn't have.
  expect((await request.get("/ws/0123456789abcdef0123456789abcdef")).status()).toBe(426);
  expect((await request.get("/ws/not-a-room")).status()).toBe(404);
});
