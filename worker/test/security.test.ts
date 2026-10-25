import { exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { connect, newRoomId } from "./helpers";

// Headers on every response the Worker itself makes (the static site gets the same ones
// from web/public/_headers; e2e/site/security.spec.ts checks those on the real site).
const REQUIRED: Record<string, string> = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
const CSP_PARTS = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
];

const fetchPath = (path: string, init?: RequestInit) =>
  exports.default.fetch(`https://handit.test${path}`, init);
const upgrade = (extra: Record<string, string> = {}) => ({
  headers: { Upgrade: "websocket", ...extra },
});

function expectSecurityHeaders(response: Response) {
  for (const [name, value] of Object.entries(REQUIRED)) {
    expect(response.headers.get(name)).toBe(value);
  }
  const csp = response.headers.get("content-security-policy") ?? "";
  for (const part of CSP_PARTS) expect(csp).toContain(part);
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\/(?!handit)/);
}

describe("headers on the Worker's own responses", () => {
  test.each([
    ["not found", "/ws/not-a-room", upgrade()],
    ["426 without an upgrade", `/ws/${newRoomId()}?role=guest`, undefined],
    ["400 for a bad query", `/ws/${newRoomId()}?role=admin`, upgrade()],
  ])("%s", async (_, path, init) => {
    expectSecurityHeaders(await fetchPath(path, init));
  });
});

describe("origin check", () => {
  const room = () => `/ws/${newRoomId()}?role=guest`;

  test("a page on another site is refused with 403", async () => {
    const response = await fetchPath(room(), upgrade({ Origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expectSecurityHeaders(response);
  });

  test.each([
    "http://handit.test", // same host, other scheme
    "https://handit.test.evil.example",
    "https://evil.example/https://handit.test",
    "null",
  ])("look-alike origin %s is refused", async (origin) => {
    expect((await fetchPath(room(), upgrade({ Origin: origin }))).status).toBe(403);
  });

  test("the site's own origin is allowed", async () => {
    const response = await fetchPath(room(), upgrade({ Origin: "https://handit.test" }));
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close(1000);
  });

  test("an origin listed in ALLOWED_ORIGINS is allowed (local development only)", async () => {
    const response = await fetchPath(room(), upgrade({ Origin: "http://localhost:5173" }));
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close(1000);
  });

  test("no Origin (not a browser page) is not blocked", async () => {
    expect(await (await connect(newRoomId(), "role=owner&ttl=60")).isOpen()).toBe(true);
  });

  test("a refused origin doesn't use up the per-IP allowance", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 310; i++) {
      await fetchPath(room(), upgrade({ Origin: "https://evil.example", "CF-Connecting-IP": ip }));
    }
    const ok = await connect(newRoomId(), "role=owner&ttl=60", ip);
    expect(await ok.isOpen()).toBe(true);
  });
});
