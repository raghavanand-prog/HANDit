import { randomBytes } from "node:crypto";
import { type Browser, devices, expect, type Page, test } from "@playwright/test";

// The failure screens of §3.9, triggered on the real site. Codes that need a real clock, a
// real network failure or a very large input are covered by unit tests (see docs/testing.md).
const file = { name: "photo.jpg", mimeType: "image/jpeg", buffer: randomBytes(200_000) };

async function newPage(browser: Browser, options = {}) {
  const context = await browser.newContext({ ...options });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  return context.newPage();
}

async function showSendCode(page: Page) {
  await page.goto("/send");
  await page.getByTestId("pick-files").setInputFiles([file]);
  await page.getByRole("button", { name: "Show code" }).click();
  await page.getByRole("button", { name: "Copy link" }).click();
  return page.evaluate(() => navigator.clipboard.readText());
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name });

test("LINK_UNSUPPORTED_VERSION: a link from a newer version asks for a reload", async ({
  page,
}) => {
  // version byte 2, SEND mode, 36 more bytes
  const payload = Buffer.from([2, 1, ...new Array<number>(36).fill(7)]).toString("base64url");
  await page.goto(`/j#${payload}`);
  await expect(heading(page, "This code comes from a newer version of HANDit.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("BROWSER_UNSUPPORTED: no WebRTC data channels", async ({ page }) => {
  await page.addInitScript(() => {
    // biome-ignore lint/suspicious/noExplicitAny: removing a browser feature for the test
    delete (window as any).RTCPeerConnection;
  });
  await page.goto("/send");
  await expect(heading(page, "This browser can't run HANDit.")).toBeVisible();
  await expect(page.getByText("Missing: WebRTC data channels")).toBeHidden(); // inside Details
  await page.locator("summary", { hasText: "Details" }).click();
  await expect(page.getByText("Missing: WebRTC data channels")).toBeVisible();
});

test("SERVER_UNREACHABLE: the Room can't be reached", async ({ page }) => {
  await page.addInitScript(() => {
    class DeadSocket extends EventTarget {
      readyState = 0;
      constructor() {
        super();
        setTimeout(() => {
          this.readyState = 3;
          this.dispatchEvent(Object.assign(new Event("close"), { code: 1006, reason: "" }));
        }, 20);
      }
      send() {}
      close() {}
    }
    // biome-ignore lint/suspicious/noExplicitAny: replacing the browser's WebSocket for the test
    (window as any).WebSocket = DeadSocket;
  });
  await page.goto("/receive");
  await expect(heading(page, "Couldn't reach HANDit.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("CODE_EXPIRED: the countdown ends and Show new code makes a new code", async ({ page }) => {
  await page.clock.install();
  await page.goto("/receive");
  await expect(page.getByTestId("countdown")).toHaveText(/Expires in [12]:\d\d/);
  const before = await page.getByRole("img", { name: "QR code for the link" }).innerHTML();
  await page.clock.fastForward(121_000);
  await expect(heading(page, "Code expired.")).toBeVisible();
  await page.getByRole("button", { name: "Show new code" }).click();
  await expect(page.getByTestId("countdown")).toBeVisible();
  expect(await page.getByRole("img", { name: "QR code for the link" }).innerHTML()).not.toBe(
    before,
  );
});

test("CODE_NOT_ACTIVE: opening a code that was cancelled", async ({ browser }) => {
  const sender = await newPage(browser);
  const link = await showSendCode(sender);
  await sender.getByRole("button", { name: "Cancel" }).click();
  const late = await newPage(browser);
  await late.goto(link);
  await expect(heading(late, "This code isn't active anymore.")).toBeVisible();
  await expect(late).toHaveURL(/\/j$/);
});

test("PEER_LEFT: the sender closes the tab while the recipient reviews", async ({ browser }) => {
  const sender = await newPage(browser);
  const phone = await newPage(browser, devices["Pixel 7"]);
  await phone.goto(await showSendCode(sender));
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(heading(phone, "Review files")).toBeVisible();
  await sender.close();
  await expect(heading(phone, "The other device left.")).toBeVisible();
  await expect(
    phone.getByText("Files that finished are saved; send the rest again."),
  ).toBeVisible();
});

test("CANCELLED_BY_USER and CANCELLED_BY_PEER: the sender cancels while waiting for a decision", async ({
  browser,
}) => {
  const sender = await newPage(browser);
  const phone = await newPage(browser);
  await phone.goto(await showSendCode(sender));
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(heading(phone, "Review files")).toBeVisible();
  await sender.getByRole("button", { name: "Cancel" }).click();
  await expect(heading(sender, "Transfer cancelled.")).toBeVisible();
  await expect(heading(phone, "The other device cancelled.")).toBeVisible();
  await expect(phone.getByText("Partial files were removed.")).toBeVisible();
});

test("STORAGE_TOO_SMALL: Accept stays disabled and says why", async ({ browser }) => {
  const sender = await newPage(browser);
  const phone = await newPage(browser);
  await phone.addInitScript(() => {
    navigator.storage.estimate = async () => ({ quota: 10 * 1024 * 1024, usage: 0 });
  });
  await phone.goto(await showSendCode(sender));
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(phone.getByText(/Not enough browser storage: needs .* available\./)).toBeVisible();
  await expect(phone.getByRole("button", { name: "Accept" })).toBeDisabled();
});

test("P2P_FAILED: no direct connection within 20 seconds", async ({ browser }) => {
  test.setTimeout(90_000);
  const sender = await newPage(browser);
  const phone = await newPage(browser);
  // The phone may only use a relay, which HANDit never offers, so no direct path can form.
  await phone.addInitScript(() => {
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(config?: RTCConfiguration) {
        super({ ...config, iceTransportPolicy: "relay" });
      }
    };
  });
  await phone.goto(await showSendCode(sender));
  await expect(heading(phone, "These devices couldn't connect directly.")).toBeVisible({
    timeout: 40_000,
  });
  await expect(heading(sender, "These devices couldn't connect directly.")).toBeVisible({
    timeout: 40_000,
  });
  await expect(phone.getByRole("button", { name: "Try again" })).toBeVisible();
  await phone.locator("summary", { hasText: "Details" }).click();
  await expect(phone.getByText(/Candidates found — this device: none/)).toBeVisible();
});
