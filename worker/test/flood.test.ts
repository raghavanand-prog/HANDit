import { exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { newIp, newRoomId } from "./helpers";

// A rate limit that runs before any Durable Object is touched, so a flood of attempts costs a
// Worker request and nothing more. It is counted per client address, and only on the real site:
// the local test server and the Worker's own tests (hosts that can't be the live site) skip it.
const REAL = "https://handit.example"; // not localhost, not .test: the guard applies

// A refusal closes the socket at once; an accepted one stays open, so only a refusal is waited for.
const attempt = async (
  query: string,
  ip: string,
  host = REAL,
  waitMs = 100,
  roomId = newRoomId(),
) => {
  const response = await exports.default.fetch(`${host}/ws/${roomId}?${query}`, {
    headers: { Upgrade: "websocket", "CF-Connecting-IP": ip },
  });
  const ws = response.webSocket;
  if (!ws) return { code: -1, status: response.status };
  ws.accept();
  const code = await new Promise<number>((resolve) => {
    ws.addEventListener("close", (event) => resolve(event.code));
    setTimeout(() => resolve(0), waitMs); // still open: accepted
  });
  return { code, status: response.status };
};

describe("new codes", () => {
  test("a client may start 10 a minute; the 11th is refused with 4429", async () => {
    const ip = newIp();
    for (let i = 0; i < 10; i++) expect((await attempt("role=owner&ttl=60", ip)).code).toBe(0);
    expect((await attempt("role=owner&ttl=60", ip, REAL, 3000)).code).toBe(4429);
  });

  test("another client is unaffected", async () => {
    const busy = newIp();
    for (let i = 0; i < 11; i++) await attempt("role=owner&ttl=60", busy);
    expect((await attempt("role=owner&ttl=60", newIp())).code).toBe(0);
  });
});

describe("joining", () => {
  test("a client may try 30 a minute; the 31st is refused with 4429", async () => {
    const ip = newIp();
    for (let i = 0; i < 30; i++)
      expect((await attempt("role=guest", ip, REAL, 3000)).code).toBe(4404);
    expect((await attempt("role=guest", ip, REAL, 3000)).code).toBe(4429);
  });

  test("starting codes and joining are counted separately", async () => {
    const ip = newIp();
    for (let i = 0; i < 11; i++) await attempt("role=owner&ttl=60", ip);
    expect((await attempt("role=guest", ip, REAL, 3000)).code).toBe(4404);
  });
});

describe("sign-in", () => {
  const signIn = (ip: string) =>
    exports.default.fetch(`${REAL}/auth/github/start`, { headers: { "CF-Connecting-IP": ip } });

  test("a client may start 3 a minute; the 4th is refused with 429", async () => {
    const ip = newIp();
    for (let i = 0; i < 3; i++) expect((await signIn(ip)).status).not.toBe(429);
    expect((await signIn(ip)).status).toBe(429);
  });

  test("reading who is signed in is not counted", async () => {
    const ip = newIp();
    for (let i = 0; i < 20; i++) {
      const response = await exports.default.fetch(`${REAL}/auth/me`, {
        headers: { "CF-Connecting-IP": ip },
      });
      expect(response.status).toBe(200);
    }
  });
});

describe("where it does not apply", () => {
  test.each(["http://localhost:8788", "http://127.0.0.1:8788", "https://handit.test"])(
    "%s is never limited by it",
    async (host) => {
      const ip = newIp();
      for (let i = 0; i < 15; i++) {
        expect((await attempt("role=owner&ttl=60", ip, host)).code).toBe(0);
      }
    },
  );

  test("invalid requests are turned away before they are counted", async () => {
    const ip = newIp();
    for (let i = 0; i < 15; i++) {
      const response = await exports.default.fetch(`${REAL}/ws/${newRoomId()}?role=admin`, {
        headers: { Upgrade: "websocket", "CF-Connecting-IP": ip },
      });
      expect(response.status).toBe(400);
    }
    expect((await attempt("role=owner&ttl=60", ip)).code).toBe(0);
  });
});
