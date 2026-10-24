import { randomBytes } from "node:crypto";
import { type Browser, expect, test } from "@playwright/test";
import { showCode } from "./camera";

const file = { name: "IMG_0042.HEIC", mimeType: "image/heic", buffer: randomBytes(500_000) };

async function laptop(browser: Browser, camera = false) {
  const context = await browser.newContext({
    permissions: camera
      ? ["camera", "clipboard-read", "clipboard-write"]
      : ["clipboard-read", "clipboard-write"],
  });
  return context.newPage();
}

test("J1 without Copy link: the second laptop scans the sender's code with its webcam", async ({
  browser,
}) => {
  const sender = await laptop(browser);
  const scanner = await laptop(browser, true);

  await sender.goto("/send");
  await sender.getByTestId("pick-files").setInputFiles([file]);
  await sender.getByRole("button", { name: "Show code" }).click();
  await sender.getByRole("button", { name: "Copy link" }).click();
  showCode(await sender.evaluate(() => navigator.clipboard.readText())); // the webcam sees this screen

  await scanner.goto("/");
  await scanner.getByRole("link", { name: "Scan a code with this device's camera" }).click();
  await expect(scanner.getByRole("heading", { name: "Scan a code" })).toBeVisible();
  await expect(sender.getByRole("heading", { name: "Send to this device?" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(scanner).toHaveURL(/\/j$/);
  await sender.getByRole("button", { name: "Allow", exact: true }).click();

  await scanner.getByRole("button", { name: "Accept" }).click();
  await expect(scanner.getByText("Original quality · Identical ✓")).toBeVisible();
  await expect(sender.getByText("Original quality · Identical ✓")).toBeVisible();
});

test("J2 without Copy link: a laptop scans the receiver's code and sends to it", async ({
  browser,
}) => {
  const receiver = await laptop(browser);
  const scanner = await laptop(browser, true);

  await receiver.goto("/receive");
  await receiver.getByRole("button", { name: "Copy link" }).click();
  showCode(await receiver.evaluate(() => navigator.clipboard.readText()));

  await scanner.goto("/scan");
  await expect(scanner.getByRole("heading", { name: "Send to this device" })).toBeVisible({
    timeout: 30_000,
  });
  await scanner.getByTestId("pick-files").setInputFiles([file]);
  await scanner.getByRole("button", { name: "Send", exact: true }).click();

  await receiver.getByRole("button", { name: "Accept" }).click();
  await expect(receiver.getByText("Original quality · Identical ✓")).toBeVisible();
  await expect(scanner.getByText("Original quality · Identical ✓")).toBeVisible();
});

test("a code that isn't HANDit's is ignored and the scanner keeps looking", async ({ browser }) => {
  const scanner = await laptop(browser, true);
  showCode("WIFI:T:WPA;S:cafe;P:hunter2;;");
  await scanner.goto("/scan");
  await expect(scanner.getByText("That isn't a HANDit code.")).toBeVisible({ timeout: 30_000 });
  await expect(scanner.getByRole("heading", { name: "Scan a code" })).toBeVisible();
  await expect(scanner).toHaveURL(/\/scan$/);
});

test("without camera permission the scanner explains what to do", async ({ browser }) => {
  const page = await laptop(browser);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/scan");
  await expect(page.getByText("HANDit needs camera access to scan.")).toBeVisible();
  await expect(page.getByText("or ask the other device to use Copy link.")).toBeVisible();
});

test("a laptop's own page works with a fake camera that sees nothing", async ({ browser }) => {
  const scanner = await laptop(browser, true);
  showCode(null);
  await scanner.goto("/scan");
  await expect(
    scanner.getByRole("img", { name: "Camera preview" }).or(scanner.getByLabel("Camera preview")),
  ).toBeVisible();
  await scanner.waitForTimeout(1500);
  await expect(scanner).toHaveURL(/\/scan$/);
});
