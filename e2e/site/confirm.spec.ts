import { randomBytes } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";

// T-19, "Confirm who receives": closes the residual of threat T4 (someone else opens a send
// code first). The sender sees who joined and taps Allow BEFORE the file list is sent.
const file = { name: "private-photo.jpg", mimeType: "image/jpeg", buffer: randomBytes(200_000) };

async function newPage(browser: Browser, name: string) {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await page.addInitScript((deviceName) => {
    localStorage.setItem(
      "handit.settings",
      JSON.stringify({ name: deviceName, lifetime: 120, confirmReceiver: true }),
    );
  }, name);
  return page;
}

async function showSendCode(sender: Page) {
  await sender.goto("/send");
  await sender.getByTestId("pick-files").setInputFiles([file]);
  await sender.getByRole("button", { name: "Show code" }).click();
  await sender.getByRole("button", { name: "Copy link" }).click();
  return sender.evaluate(() => navigator.clipboard.readText());
}

test("T4: a stranger who opens the code first never receives the file list", async ({
  browser,
}) => {
  const sender = await newPage(browser, "Raghav's MacBook");
  const stranger = await newPage(browser, "Totally Your Friend");
  await stranger.goto(await showSendCode(sender));

  // The sender is asked, with the joining device's name and its "not verified" mark.
  await expect(sender.getByRole("heading", { name: "Send to this device?" })).toBeVisible();
  await expect(sender.getByText("Totally Your Friend (Chrome)")).toBeVisible();
  await expect(sender.getByText("name not verified")).toBeVisible();
  await sender.waitForTimeout(1500); // while the sender decides, nothing is offered
  await expect(stranger.getByRole("heading", { name: "Review files" })).toBeHidden();

  await sender.getByRole("button", { name: "Don't allow" }).click();
  await expect(sender.getByRole("heading", { name: "Transfer cancelled." })).toBeVisible();
  await expect(
    stranger.getByRole("heading", { name: "The other device cancelled." }),
  ).toBeVisible();
  await expect(stranger.getByRole("heading", { name: "Review files" })).toBeHidden();
  await expect(stranger.getByText("private-photo.jpg")).toBeHidden();

  // The sender can show a new code for the person they meant.
  await sender.getByRole("button", { name: "Show new code" }).click();
  await expect(sender.getByTestId("countdown")).toBeVisible();
});

test("the real recipient is let through: Allow sends the file list", async ({ browser }) => {
  const sender = await newPage(browser, "Raghav's MacBook");
  const friend = await newPage(browser, "Friend's phone");
  await friend.goto(await showSendCode(sender));
  await expect(sender.getByText("Friend's phone (Chrome)")).toBeVisible();
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(friend.getByRole("heading", { name: "Review files" })).toBeVisible();
  await expect(friend.getByText("private-photo.jpg")).toBeVisible();
});

test("the sender can switch it off in Settings, and it is on by default", async ({ browser }) => {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sender = await context.newPage();
  await sender.goto("/settings");
  const toggle = sender.getByRole("checkbox", { name: /Confirm who receives/ });
  await expect(toggle).toBeChecked(); // on by default
  await toggle.uncheck();

  const friend = await (await browser.newContext()).newPage();
  await friend.goto(await showSendCode(sender));
  // No Allow step: the file list goes straight to the recipient.
  await expect(friend.getByRole("heading", { name: "Review files" })).toBeVisible();
  await expect(sender.getByRole("button", { name: "Allow", exact: true })).toBeHidden();
});

test("Confirm who receives never applies when the receiving device shows the code", async ({
  browser,
}) => {
  // A receive code (J2): the scanning device chooses files to send, so there is nobody to confirm.
  const laptop = await newPage(browser, "Laptop");
  const phone = await newPage(browser, "Phone");
  await laptop.goto("/receive");
  await laptop.getByRole("button", { name: "Copy link" }).click();
  await phone.goto(await laptop.evaluate(() => navigator.clipboard.readText()));
  await expect(phone.getByRole("heading", { name: "Send to this device" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Allow", exact: true })).toBeHidden();
});
