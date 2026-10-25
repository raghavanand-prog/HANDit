import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, devices, expect, type Page, test } from "@playwright/test";

// Automated accessibility checks (contrast, names and labels, structure) on every main screen,
// in light and dark, on a phone and a desktop. Plus the things automation can't see: keyboard
// reach, visible focus, reduced motion and touch-target size.
const file = { name: "IMG_0042.HEIC", mimeType: "image/heic", buffer: randomBytes(400_000) };
const views = [
  { name: "phone", options: devices["iPhone 13"] },
  { name: "desktop", options: { viewport: { width: 1280, height: 800 } } },
];
const schemes = ["light", "dark"] as const;

async function check(page: Page, label: string) {
  // Let the screen finish easing in: contrast is measured on settled text, not mid-fade.
  await page.waitForTimeout(350);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`,
  );
  expect(summary, label).toEqual([]);
}

async function newPage(browser: Browser, options: object, colorScheme: "light" | "dark") {
  const context = await browser.newContext({ ...options, colorScheme });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  return context.newPage();
}

for (const view of views) {
  for (const scheme of schemes) {
    test(`no accessibility violations: ${view.name}, ${scheme}`, async ({ browser }) => {
      const sender = await newPage(browser, view.options, scheme);
      const phone = await newPage(browser, view.options, scheme);
      const tag = `${view.name}/${scheme}`;

      for (const path of [
        "/",
        "/settings",
        "/how-it-works",
        "/privacy",
        "/limitations",
        "/about",
        "/help",
        "/help/P2P_FAILED",
        "/feedback",
        "/j#broken",
      ]) {
        await sender.goto(path);
        await expect(sender.locator("h1")).toBeVisible();
        // Scroll through, so sections that rise in as they appear have settled.
        await sender.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 500) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
        });
        await sender.waitForTimeout(1000); // the last section finishes rising in
        await check(sender, `${tag} ${path}`);
      }

      await sender.goto("/send");
      await check(sender, `${tag} send, empty`);
      await sender.getByTestId("pick-files").setInputFiles([file]);
      await check(sender, `${tag} send, files picked`);
      await sender.getByRole("button", { name: "Show code" }).click();
      await sender.getByRole("button", { name: "Copy link" }).click();
      await check(sender, `${tag} code`);

      await phone.goto(await sender.evaluate(() => navigator.clipboard.readText()));
      await expect(sender.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
      await check(sender, `${tag} confirm who receives`);
      await sender.getByRole("button", { name: "Allow", exact: true }).click();
      await expect(phone.getByRole("button", { name: "Accept" })).toBeEnabled();
      await check(phone, `${tag} review`);
      await phone.getByRole("button", { name: "Accept" }).click();
      await expect(phone.getByText("Original quality · Identical ✓")).toBeVisible();
      await check(phone, `${tag} received`);
      await check(sender, `${tag} sent`);
    });
  }
}

test("keyboard: every control is reachable and focus is visible", async ({ page }) => {
  await page.goto("/send");
  await page.keyboard.press("Tab"); // skip link
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const stops: string[] = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const outline = getComputedStyle(el).outlineStyle;
      return {
        name: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName,
        outline,
      };
    });
    if (info.name.includes("Skip to content") && info.name.length > 20) break; // focus left the page
    stops.push(info.name);
    expect(info.outline, `focus ring on "${info.name}"`).not.toBe("none");
  }
  expect(stops).toEqual(expect.arrayContaining(["Choose files", "Choose a folder", "Settings"]));
});

test("reduced motion: no animation or transition is left running", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: /^Receive/ }).click();
  await expect(page.getByTestId("countdown")).toBeVisible();
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running" && (a as CSSAnimation).animationName)
      .map((a) => (a as CSSAnimation).animationName),
  );
  expect(running).toEqual([]);
});

test("touch targets on a phone are at least 44 by 44 pixels", async ({ browser }) => {
  const page = await newPage(browser, devices["iPhone 13"], "light");
  await page.goto("/send");
  await page.getByTestId("pick-files").setInputFiles([file]);
  const small: string[] = [];
  for (const target of await page
    .locator("button, a[href], [role=switch], input:not([hidden])")
    .all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    const name =
      (await target.textContent())?.trim().slice(0, 24) ||
      (await target.getAttribute("aria-label")) ||
      "?";
    // Links inside a line of text and the footer links are exempt; buttons and switches are not.
    const inline = await target.evaluate(
      (el) => el.classList.contains("sr-only") || (el.tagName === "A" && !!el.closest("footer, p")),
    );
    if (box && !inline && (box.height < 44 || box.width < 44))
      small.push(`${name} (${Math.round(box.width)}x${Math.round(box.height)})`);
  }
  expect(small).toEqual([]);
});

test("offline: a banner says what is wrong", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await expect(page.getByText(/You're offline\./)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/You're offline\./)).toBeHidden();
});
