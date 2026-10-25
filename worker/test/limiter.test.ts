import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { clientKey, LIMITS, limitsFor, WINDOW_MS } from "../src/limiter";
import { connect, newIp, newRoomId } from "./helpers";

const limiter = (ip: string) => env.LIMITER.getByName(ip);
const age = (ip: string, ms: number) =>
  runInDurableObject(limiter(ip), (_, state) => {
    for (const kind of ["room", "join"]) {
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
    expect(limitsFor({})).toEqual({ room: 100, join: 300 });
    expect(limitsFor({ LIMIT_MULTIPLIER: "" })).toEqual({ room: 100, join: 300 });
  });

  test("the test multiplier raises them, and nonsense never lowers them", () => {
    expect(limitsFor({ LIMIT_MULTIPLIER: "100" })).toEqual({ room: 10_000, join: 30_000 });
    expect(limitsFor({ LIMIT_MULTIPLIER: "5000" })).toEqual({ room: 100_000, join: 300_000 });
    for (const bad of ["0", "-5", "abc", "NaN", "0.2"]) {
      expect(limitsFor({ LIMIT_MULTIPLIER: bad })).toEqual({ room: 100, join: 300 });
    }
  });
});
