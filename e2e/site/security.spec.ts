import { randomBytes } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";

const file = { name: "photo.jpg", mimeType: "image/jpeg", buffer: randomBytes(300_000) };

async function newPage(browser: Browser) {
  const context = await browser.newContext();
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

/** Everything that left a page: request URLs, headers and bodies, and WebSocket frames. */
function record(page: Page, log: string[], origins: Set<string>) {
  page.on("request", (request) => {
    origins.add(new URL(request.url()).origin);
    log.push(request.url(), JSON.stringify(request.headers()), request.postData() ?? "");
  });
  page.on("websocket", (ws) => {
    origins.add(new URL(ws.url()).origin.replace(/^ws/, "http"));
    log.push(ws.url());
    ws.on("framesent", (frame) => log.push(String(frame.payload)));
    ws.on("framereceived", (frame) => log.push(String(frame.payload)));
  });
}

test("S1 and S2: the secret never leaves the browsers, and leaves the address bar", async ({
  browser,
}) => {
  const sender = await newPage(browser);
  const phone = await newPage(browser);
  const log: string[] = [];
  const origins = new Set<string>();
  record(sender, log, origins);
  record(phone, log, origins);

  const link = await showSendCode(sender);
  const payload = link.split("#")[1] ?? "";
  const secret = Buffer.from(payload, "base64url").subarray(6);
  const needles = [
    payload,
    secret.toString("base64url"),
    secret.toString("hex"),
    secret.toString("base64"),
  ];
  expect(needles.every((n) => n.length >= 43)).toBe(true);

  await phone.goto(link);
  await expect(phone).toHaveURL(/\/j$/); // S2: the secret is gone from the address bar
  expect(await phone.evaluate(() => location.href)).not.toContain("#");
  expect(await phone.evaluate(() => document.referrer)).toBe("");
  await sender.getByRole("button", { name: "Allow", exact: true }).click();
  await phone.getByRole("button", { name: "Accept" }).click();
  await expect(phone.getByText("Original quality · Identical ✓")).toBeVisible();

  const everything = log.join("\n");
  expect(everything.length).toBeGreaterThan(1000); // we really did record the transfer
  for (const needle of needles) expect(everything).not.toContain(needle);
  // S10: nothing on the page talked to any origin but its own.
  expect([...origins]).toEqual([new URL(link).origin]);
});

test("S3: a frame changed in the Room is detected and nothing connects", async ({ browser }) => {
  const sender = await newPage(browser);
  const phone = await newPage(browser);
  // The phone's connection to the Room passes through us; we change one character of the
  // first sealed frame the Room forwards to it (the owner's welcome).
  await phone.routeWebSocket(/\/ws\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    let changed = false;
    server.onMessage((message) => {
      if (changed || typeof message !== "string") return ws.send(message);
      changed = true;
      const frame = JSON.parse(message) as { ct: string };
      frame.ct = `${frame.ct[0] === "A" ? "B" : "A"}${frame.ct.slice(1)}`;
      ws.send(JSON.stringify(frame));
    });
  });
  await phone.goto(await showSendCode(sender));
  await expect(
    phone.getByRole("heading", {
      name: "The connection couldn't be verified, so nothing was sent.",
    }),
  ).toBeVisible();
  await expect(phone.getByRole("heading", { name: "Review files" })).toBeHidden();
  await expect(sender.getByRole("heading", { name: "Send to this device?" })).toBeHidden();
});

test("S10: every response carries the security headers", async ({ page, request }) => {
  await page.goto("/");
  const script = await page.locator("script[src]").first().getAttribute("src");
  const paths = [
    "/",
    "/j",
    "/send",
    "/signin",
    "/how-it-works",
    script ?? "/assets/x.js",
    "/favicon.svg",
    "/no-such-page",
  ];
  for (const path of paths) {
    const response = await request.get(path);
    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain("base-uri 'none'");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).not.toMatch(/unsafe-|https?:|wss?:/);
    expect(headers["referrer-policy"], path).toBe("no-referrer");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
  }
  for (const path of ["/ws/not-a-room", "/ws/0123456789abcdef0123456789abcdef"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["content-security-policy"], path).toContain("default-src 'self'");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
  }
});

test("S10: the policy is enforced: inline script is blocked and the app raises no violations", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/.test(message.text())) violations.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("link", { name: /^Send/ }).click();
  await page.goto("/how-it-works");
  expect(violations).toEqual([]);

  const blocked = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", (e) => resolve(e.violatedDirective));
        const inline = document.createElement("script");
        inline.textContent = "window.__injected = true";
        document.body.append(inline);
        setTimeout(() => resolve("not blocked"), 1000);
      }),
  );
  expect(blocked).toMatch(/^script-src/);
  expect(
    await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected),
  ).toBeUndefined();
});
