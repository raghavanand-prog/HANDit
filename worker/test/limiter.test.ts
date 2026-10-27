import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { clientKey, LIMITS, limitsFor, WINDOW_MS, wideKey } from "../src/limiter";
import { connect, newIp, newRoomId } from "./helpers";

const limiter = (ip: string) => env.LIMITER.getByName(ip);
const age = (ip: string, ms: number) =>
  runInDurableObject(limiter(ip), (_, state) => {
    for (const kind of ["room", "join", "auth"]) {
      const times = state.storage.kv.get<number[]>(kind) ?? [];
      state.storage.kv.put(
        kind,
        times.map((t) => t - ms),
      );
    }
  });

describe("counting (S7)", () => {
  test("at most 100 new codes per IP; joins are counted separately", async () => {
    const ip = newIp();
    expect(LIMITS.room).toBe(100);
    for (let i = 0; i < 100; i++) expect(await limiter(ip).allow("room")).toBe(true);
    expect(await limiter(ip).allow("room")).toBe(false);
    expect(await limiter(ip).allow("join")).toBe(true);
  });

  test("at most 300 join attempts per IP", async () => {
    const ip = newIp();
    expect(LIMITS.join).toBe(300);
    for (let i = 0; i < 300; i++) expect(await limiter(ip).allow("join")).toBe(true);
    expect(await limiter(ip).allow("join")).toBe(false);
  });

  test("at most 30 sign-in attempts per IP", async () => {
    const ip = newIp();
    expect(LIMITS.auth).toBe(30);
    for (let i = 0; i < 30; i++) expect(await limiter(ip).allow("auth")).toBe(true);
    expect(await limiter(ip).allow("auth")).toBe(false);
    expect(await limiter(ip).allow("room")).toBe(true); // separate counters
  });

  test("attempts older than 10 minutes no longer count", async () => {
    const ip = newIp();
    for (let i = 0; i < 100; i++) await limiter(ip).allow("room");
    expect(await limiter(ip).allow("room")).toBe(false);
    await age(ip, WINDOW_MS);
    expect(await limiter(ip).allow("room")).toBe(true);
  });

  test("an IP is forgotten 10 minutes after its last attempt", async () => {
    const ip = newIp();
    await limiter(ip).allow("join");
    const alarm = await runInDurableObject(limiter(ip), (_, state) => state.storage.getAlarm());
    expect(alarm).toBeGreaterThan(Date.now() + WINDOW_MS - 5000);

    await runDurableObjectAlarm(limiter(ip)); // too early: the attempt is still recent
    expect(await runInDurableObject(limiter(ip), (_, s) => s.storage.kv.get("join"))).toHaveLength(
      1,
    );

    await age(ip, WINDOW_MS);
    await runDurableObjectAlarm(limiter(ip));
    const left = await runInDurableObject(limiter(ip), async (_, state) => ({
      keys: [...state.storage.kv.list()].length,
      alarm: await state.storage.getAlarm(),
    }));
    expect(left).toEqual({ keys: 0, alarm: null });
  });
});

describe("through the Worker", () => {
  test("the 101st new code from one IP is closed with 4429", async () => {
    const ip = newIp();
    for (let i = 0; i < 100; i++) {
      expect(await (await connect(newRoomId(), "role=owner&ttl=60", ip)).isOpen()).toBe(true);
    }
    const refused = await connect(newRoomId(), "role=owner&ttl=60", ip);
    expect(await refused.closed).toEqual({ code: 4429, reason: "Too many attempts" });
    const otherIp = await connect(newRoomId(), "role=owner&ttl=60", newIp());
    expect(await otherIp.isOpen()).toBe(true);
  }, 60_000);

  test("the 301st join attempt from one IP is closed with 4429, even if earlier ones failed", async () => {
    const ip = newIp();
    for (let i = 0; i < 300; i++) {
      expect((await (await connect(newRoomId(), "role=guest", ip)).closed).code).toBe(4404);
    }
    const refused = await connect(newRoomId(), "role=guest", ip);
    expect(await refused.closed).toEqual({ code: 4429, reason: "Too many attempts" });
  }, 60_000);
});

describe("clientKey", () => {
  const key = (ip?: string) =>
    clientKey(
      new Request("https://handit.test", { headers: ip ? { "CF-Connecting-IP": ip } : {} }),
    );

  test("IPv4 addresses are counted one by one", () => {
    expect(key("203.0.113.5")).toBe("203.0.113.5");
    expect(key("::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  test("IPv6 addresses are counted per /64, since one user usually controls a whole /64", () => {
    expect(key("2001:db8:1:2:aaaa::1")).toBe(key("2001:0DB8:0001:0002:bbbb:cccc:dddd:eeee"));
    expect(key("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(key("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(key("2001:db8:1:3::1")).not.toBe(key("2001:db8:1:2::1"));
  });

  test("a missing address shares one bucket", () => {
    expect(key()).toBe("unknown");
  });
});

describe("limitsFor", () => {
  test("production uses the base limits: 100 codes and 300 joins", () => {
    expect(limitsFor({})).toEqual({ room: 100, join: 300, auth: 30 });
    expect(limitsFor({ LIMIT_MULTIPLIER: "" })).toEqual({ room: 100, join: 300, auth: 30 });
  });

  test("the test multiplier raises them, and nonsense never lowers them", () => {
    expect(limitsFor({ LIMIT_MULTIPLIER: "100" }, true)).toEqual({
      room: 10_000,
      join: 30_000,
      auth: 3000,
    });
    expect(limitsFor({ LIMIT_MULTIPLIER: "5000" }, true)).toEqual({
      room: 100_000,
      join: 300_000,
      auth: 30_000,
    });
    for (const bad of ["0", "-5", "abc", "NaN", "0.2"]) {
      expect(limitsFor({ LIMIT_MULTIPLIER: bad }, true)).toEqual({
        room: 100,
        join: 300,
        auth: 30,
      });
    }
  });
});

describe("sign-in routes are limited too", () => {
  const authStart = (ip: string) =>
    exports.default.fetch("https://handit.test/auth/github/start", {
      headers: { "CF-Connecting-IP": ip },
    });

  test("the 31st sign-in attempt from one IP is refused with 429, before any provider call", async () => {
    const ip = newIp();
    for (let i = 0; i < 30; i++) expect((await authStart(ip)).status).not.toBe(429);
    expect((await authStart(ip)).status).toBe(429);
    expect((await authStart(newIp())).status).not.toBe(429); // another IP is unaffected
  });

  test("the read-only sign-in status calls are not counted", async () => {
    const ip = newIp();
    for (let i = 0; i < 40; i++) {
      const response = await exports.default.fetch("https://handit.test/auth/me", {
        headers: { "CF-Connecting-IP": ip },
      });
      expect(response.status).toBe(200);
    }
  });
});

describe("the test multiplier only works on the local test server (S7)", () => {
  test("on any other host it is ignored, whatever the variable says", () => {
    expect(limitsFor({ LIMIT_MULTIPLIER: "1000" })).toEqual({ room: 100, join: 300, auth: 30 });
    expect(limitsFor({ LIMIT_MULTIPLIER: "1000" }, false)).toEqual({
      room: 100,
      join: 300,
      auth: 30,
    });
  });
  test("on localhost it applies", () => {
    expect(limitsFor({ LIMIT_MULTIPLIER: "10" }, true)).toEqual({
      room: 1000,
      join: 3000,
      auth: 300,
    });
  });
});

describe("wideKey: one person can own thousands of /64s (S7)", () => {
  const request = (ip: string | null) =>
    new Request("https://x.test/", ip ? { headers: { "CF-Connecting-IP": ip } } : {});
  const key = (ip: string | null) => wideKey(request(ip));

  test("IPv4 and missing addresses have no wide bucket", () => {
    expect(key("203.0.113.9")).toBeNull();
    expect(key("::ffff:203.0.113.9")).toBeNull();
    expect(key(null)).toBeNull();
  });
  test("IPv6 addresses share a bucket per /48", () => {
    expect(key("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1::/48");
    expect(key("2001:db8:1:ffff::1")).toBe("2001:db8:1::/48");
    expect(key("2001:0db8:0001::")).toBe("2001:db8:1::/48");
    expect(key("2001:DB8:2::1")).toBe("2001:db8:2::/48");
    expect(key("::1")).toBe("0:0:0::/48");
  });
  test("it is a different key from the /64 one", () => {
    const r = request("2001:db8:1:2::1");
    expect(clientKey(r)).toBe("2001:db8:1:2::/64");
    expect(wideKey(r)).not.toBe(clientKey(r));
  });
  test("the wide bucket allows ten times as much, then refuses", async () => {
    const wide = limiter(`w:${newRoomId()}`);
    for (let i = 0; i < LIMITS.room * 10; i++) {
      expect(await wide.allow("room", false, 10)).toBe(true);
    }
    expect(await wide.allow("room", false, 10)).toBe(false);
  }, 60_000);
  test("through the Worker, /64s of one /48 are counted together", async () => {
    // 11 /64s of 30 sign-in attempts each: no /64 reaches its limit (30), the /48 does (300).
    const prefix = `2001:db8:${(Math.random() * 0xffff) | 0}`;
    const statuses: number[] = [];
    for (let net = 0; net < 11; net++) {
      for (let i = 0; i < 30; i++) {
        const response = await exports.default.fetch("https://handit.test/auth/github/start", {
          headers: { "CF-Connecting-IP": `${prefix}:${net}::1` },
        });
        statuses.push(response.status);
      }
    }
    expect(statuses.slice(0, 300).includes(429)).toBe(false);
    expect(statuses.slice(300).every((status) => status === 429)).toBe(true);
  }, 60_000);
});
