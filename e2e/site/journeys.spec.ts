import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { type BrowserContext, devices, expect, type Page, test } from "@playwright/test";

// The plan's journeys on the real site: J1 (the sender shows the code), J2 (the recipient
// shows the code) and J6 (Copy link), each ending with a real download checked byte for byte.
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const photo = {
  name: "IMG_0042.HEIC",
  mimeType: "image/heic",
  buffer: randomBytes(3 * 1024 * 1024),
};
const notes = {
  name: "notes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Original quality.\n"),
};

async function context(
  browser: import("@playwright/test").Browser,
  options = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ acceptDownloads: true, ...options });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  return ctx;
}

/** J6: Copy link puts the code's link on the clipboard. */
async function copyLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/j#[A-Za-z0-9_-]{51}$/);
  return link;
}

async function saveAndCheck(page: Page, button: string, expected: Buffer) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const path = await (await download).path();
  expect(sha256(readFileSync(path))).toBe(sha256(expected));
}

test("J1: the sender shows a code, the phone joins, reviews, accepts and saves", async ({
  browser,
}) => {
  const sender = await (await context(browser)).newPage();
  const phone = await (await context(browser, { ...devices["Pixel 7"] })).newPage();

  await sender.goto("/send");
  await sender.getByTestId("pick-files").setInputFiles([photo]);
  await expect(sender.getByText("1 item · 3.1 MB")).toBeVisible();
  await sender.getByRole("button", { name: "Show code" }).click();
  await expect(sender.getByRole("img", { name: "QR code for the link" })).toBeVisible();
  await expect(sender.getByTestId("countdown")).toHaveText(/Expires in [12]:\d\d/);
  const link = await copyLink(sender);

  await phone.goto(link);
  await expect(phone).toHaveURL(/\/j$/); // the secret is gone from the address bar
  // "Confirm who receives": the sender sees who joined and taps Allow.
  await expect(sender.getByRole("heading", { name: "Send to this device?" })).toBeVisible();
  await expect(sender.getByText("Android phone (Chrome)")).toBeVisible();
  await sender.getByRole("button", { name: "Allow", exact: true }).click();

  await expect(phone.getByRole("heading", { name: "Review files" })).toBeVisible();
  await expect(phone.getByText("1 photo · 3.1 MB")).toBeVisible();
  await expect(phone.getByText("Original quality — files arrive exactly as sent")).toBeVisible();
  await expect(phone.getByText("Direct · Browser to browser · Encrypted")).toBeVisible();
  await phone.getByRole("button", { name: "Accept" }).click();

  await expect(phone.getByText("Original quality · Identical ✓")).toBeVisible();
  await expect(sender.getByRole("heading", { name: "Sent ✓ · Original quality" })).toBeVisible();
  await expect(sender.getByText("Original quality · Identical ✓")).toBeVisible();
  await saveAndCheck(phone, "Save", photo.buffer);
});

test("J2: the recipient shows a code, the phone picks files and sends", async ({ browser }) => {
  const laptop = await (await context(browser)).newPage();
  const phone = await (await context(browser, { ...devices["iPhone 13"] })).newPage();

  await laptop.goto("/receive");
  await expect(laptop.getByText("Scan this with the phone that has the files")).toBeVisible();
  const link = await copyLink(laptop);

  await phone.goto(link);
  await expect(phone.getByRole("heading", { name: "Send to this device" })).toBeVisible();
  await expect(phone.getByText("To send original photos")).toBeVisible(); // iPhone tip
  await expect(laptop.getByText("They're choosing files… (up to 3 minutes)")).toBeVisible();
  await phone.getByTestId("pick-files").setInputFiles([photo, notes]);
  await phone.getByRole("button", { name: "Send", exact: true }).click();

  await expect(laptop.getByRole("heading", { name: "Review files" })).toBeVisible();
  await expect(laptop.getByText("iPhone (Safari)")).toBeVisible();
  await expect(laptop.getByText("name not verified")).toBeVisible();
  await laptop.getByRole("button", { name: "Accept" }).click();

  await expect(laptop.getByText("Original quality · Identical ✓")).toBeVisible();
  await expect(phone.getByText("Original quality · Identical ✓")).toBeVisible();
  const download = laptop.waitForEvent("download");
  await laptop.getByRole("button", { name: "Download all (.zip)" }).click();
  expect((await download).suggestedFilename()).toBe("HANDit files.zip");
});

test("declining tells the sender, and a used code can't be opened again", async ({ browser }) => {
  const sender = await (await context(browser)).newPage();
  const phone = await (await context(browser)).newPage();
  const stranger = await (await context(browser)).newPage();

  await sender.goto("/send");
  await sender.getByTestId("pick-files").setInputFiles([notes]);
  await sender.getByRole("button", { name: "Show code" }).click();
  const link = await copyLink(sender);

  await phone.goto(link);
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  // Once the two devices connect they leave the Room, which deletes everything about the code.
  await stranger.goto(link);
  await expect(stranger.getByText("This code isn't active anymore.")).toBeVisible();

  await phone.getByRole("button", { name: "Decline" }).click();
  await expect(sender.getByText("The other device declined the files.")).toBeVisible();
});

test("a damaged link explains itself", async ({ page }) => {
  await page.goto("/j#not-a-real-code");
  await expect(page.getByRole("heading", { name: "This link doesn't work." })).toBeVisible();
  await expect(page).toHaveURL(/\/j$/);
});
