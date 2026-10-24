// Takes the README's screenshots of a running copy of the site (default: the local test server).
// usage: node tools/screenshots.mjs [site-url]
import { randomBytes } from "node:crypto";
import { chromium, devices } from "@playwright/test";

const site = process.argv[2] ?? "http://localhost:8787";
const out = new URL("../docs/screenshots/", import.meta.url).pathname;
const launch = { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] };

const browser = await chromium.launch(launch);
const laptop = await (
  await browser.newContext({
    viewport: { width: 1100, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"],
  })
).newPage();
const phone = await (
  await browser.newContext({ ...devices["iPhone 13"], locale: "en-GB" })
).newPage();
await laptop.addInitScript(() =>
  localStorage.setItem(
    "handit.settings",
    JSON.stringify({ name: "MacBook", lifetime: 120, confirmReceiver: true }),
  ),
);

const shot = (page, name) => page.screenshot({ path: `${out}${name}.png` });

await phone.goto(site);
await shot(phone, "home");

await laptop.goto(`${site}/send`);
await laptop.getByTestId("pick-files").setInputFiles(
  ["IMG_0042.HEIC", "IMG_0043.HEIC", "IMG_0044.HEIC", "Holiday.MOV"].map((name, i) => ({
    name,
    mimeType: name.endsWith("MOV") ? "video/quicktime" : "image/heic",
    buffer: randomBytes(1_200_000 + i * 900_000),
  })),
);
await laptop.getByRole("button", { name: "Show code" }).click();
await laptop.getByRole("button", { name: "Copy link" }).click();
await laptop.waitForTimeout(300);
await shot(laptop, "code");

await phone.goto(await laptop.evaluate(() => navigator.clipboard.readText()));
await laptop.getByRole("button", { name: "Allow", exact: true }).click();
await phone.getByRole("button", { name: "Accept" }).waitFor();
await shot(phone, "review");
await phone.getByRole("button", { name: "Accept" }).click();
await phone.getByText("Original quality · Identical ✓").waitFor();
await phone.waitForTimeout(700);
await shot(phone, "complete");

await browser.close();
console.log("screenshots written to", out);
