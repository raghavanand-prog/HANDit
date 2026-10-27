import { expect, test } from "@playwright/test";

// A link's secret sits after "#". It must never stay in the address bar, however the link is
// opened: in a new tab, in a tab that already shows the app, or with an unusual spelling of /j.
// The length of a real link, with version 1 but no valid mode: the page says "This link doesn't work."
const FRAGMENT = `AQ${"A".repeat(49)}`;

test("a link opened in a tab that already shows the app is cleared from the address bar", async ({
  page,
}) => {
  await page.goto("/j");
  await page.evaluate((fragment) => {
    location.hash = fragment;
  }, FRAGMENT);
  await expect(page.getByRole("heading", { name: "This link doesn't work." })).toBeVisible();
  expect(page.url()).not.toContain("#");
  expect(await page.evaluate(() => location.href)).not.toContain(FRAGMENT);
});

test("an unusual spelling of the join path is read and cleared on load", async ({ page }) => {
  for (const path of ["/J", "/j/", "/J/"]) {
    await page.goto(`${path}#${FRAGMENT}`);
    await expect(page.getByRole("heading", { name: "This link doesn't work." })).toBeVisible();
    expect(page.url()).not.toContain("#");
    expect(new URL(page.url()).pathname).toBe("/j");
  }
});

test("a link-sized fragment on another page is dropped from the address too", async ({ page }) => {
  await page.goto(`/privacy#${FRAGMENT}`);
  expect(page.url()).not.toContain("#");
});

test("an ordinary anchor is left alone", async ({ page }) => {
  await page.goto("/privacy#main");
  expect(page.url()).toContain("#main");
});
