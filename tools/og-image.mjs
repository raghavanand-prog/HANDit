// Takes the 1200x630 preview image shown when the link is shared (LinkedIn, chat apps, search).
// It is a screenshot of the real home page, so it always matches the design.
// usage: node tools/og-image.mjs [site-url]
import { chromium } from "@playwright/test";

const site = process.argv[2] ?? "https://handit.handit-worker.workers.dev";
const out = new URL("../web/public/og.png", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await (
  await browser.newContext({
    viewport: { width: 1200, height: 630 },
    colorScheme: "light",
    deviceScaleFactor: 1,
  })
).newPage();
await page.goto(site);
await page.waitForTimeout(1600);
// A clean still of the top: no header or small print, the content centred in the frame.
await page.evaluate(() => {
  document.querySelector("header")?.remove();
  document.querySelector("section p.max-w-xl")?.remove();
  document.querySelector("section")?.setAttribute("style", "padding-top:92px;padding-bottom:0");
  document.querySelector("section .max-w-3xl")?.remove();
  for (const section of [...document.querySelectorAll("main section")].slice(1)) section.remove();
  document.body.style.overflow = "hidden";
});
await page.waitForTimeout(300);
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log("wrote", out);
