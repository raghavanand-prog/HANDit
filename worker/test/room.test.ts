import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test, vi } from "vitest";
import { connect, newRoomId, pair } from "./helpers";

type Meta = { expiresAt: number; guestJoined: boolean };
const room = (roomId: string) => env.ROOM.getByName(roomId);
const stored = (roomId: string) =>
  runInDurableObject(room(roomId), async (_, state) => ({
    meta: state.storage.kv.get<Meta>("meta"),
    alarm: await state.storage.getAlarm(),
  }));
const isWiped = async (roomId: string) => {
  const { meta, alarm } = await stored(roomId);
  return meta === undefined && alarm === null;
};

describe("owner first", () => {
  test.each([60, 120, 300])("records the code's lifetime (%i s)", async (ttl) => {
    const roomId = newRoomId();
    const owner = await connect(roomId, `role=owner&ttl=${ttl}`);
    expect(await owner.isOpen()).toBe(true);
    const { meta } = await stored(roomId);
    expect(meta?.expiresAt).toBeGreaterThan(Date.now() + ttl * 1000 - 5000);
    expect(meta?.expiresAt).toBeLessThanOrEqual(Date.now() + ttl * 1000);
  });

  test("a second owner is refused", async () => {
    const { roomId } = await pair();
    const second = await connect(roomId, "role=owner&ttl=120");
    expect(await second.closed).toEqual({ code: 4409, reason: "CODE_ALREADY_USED" });
  });
});

describe("one guest, ever (S5, S6)", () => {
  test("a guest joins an active code", async () => {
    const { guest } = await pair();
    expect(await guest.isOpen()).toBe(true);
  });

  test("a guest with no owner gets 4404 CODE_NOT_ACTIVE", async () => {
    const guest = await connect(newRoomId(), "role=guest");
    expect(await guest.closed).toEqual({ code: 4404, reason: "CODE_NOT_ACTIVE" });
  });

  test("a guest after the owner left gets 4404 CODE_NOT_ACTIVE", async () => {
    const roomId = newRoomId();
    const owner = await connect(roomId, "role=owner&ttl=120");
    owner.close();
    await vi.waitFor(async () => expect(await isWiped(roomId)).toBe(true));
    const guest = await connect(roomId, "role=guest");
    expect(await guest.closed).toEqual({ code: 4404, reason: "CODE_NOT_ACTIVE" });
  });

  test("a second guest gets 4409 CODE_ALREADY_USED", async () => {
    const { roomId } = await pair();
    const second = await connect(roomId, "role=guest");
    expect(await second.closed).toEqual({ code: 4409, reason: "CODE_ALREADY_USED" });
  });

  test("a guest after the expiry gets 4410 CODE_EXPIRED", async () => {
    const roomId = newRoomId();
    await connect(roomId, "role=owner&ttl=60");
    await runInDurableObject(room(roomId), (_, state) => {
      const meta = state.storage.kv.get<Meta>("meta");
      state.storage.kv.put("meta", { ...meta, expiresAt: Date.now() - 1 });
    });
    const guest = await connect(roomId, "role=guest");
    expect(await guest.closed).toEqual({ code: 4410, reason: "CODE_EXPIRED" });
  });

  test("once a guest has joined, the code stays used even after expiry", async () => {
    const { roomId } = await pair();
    await runInDurableObject(room(roomId), (_, state) => {
      const meta = state.storage.kv.get<Meta>("meta");
      state.storage.kv.put("meta", { ...meta, expiresAt: Date.now() - 1 });
    });
    const second = await connect(roomId, "role=guest");
    expect(await second.closed).toEqual({ code: 4409, reason: "CODE_ALREADY_USED" });
  });
});

describe("forward only", () => {
  test("frames go to the other side unchanged, both ways", async () => {
    const { owner, guest } = await pair();
    const sealed = '{"r":"guest","n":1,"iv":"AAAA","ct":"not even real ciphertext"}';
    guest.send(sealed);
    expect(await owner.receive()).toBe(sealed);
    owner.send("anything at all — the Room never reads it");
    expect(await guest.receive()).toBe("anything at all — the Room never reads it");
  });

  test("a 32 KiB frame is forwarded", async () => {
    const { owner, guest } = await pair();
    const frame = "x".repeat(32 * 1024);
    guest.send(frame);
    expect(await owner.receive()).toBe(frame);
  });
});

describe("limits (S7)", () => {
  test("a frame over 32 KiB closes the room", async () => {
    const { roomId, owner, guest } = await pair();
    guest.send("é".repeat(16 * 1024 + 1)); // 32 KiB + 2 bytes in UTF-8
    expect(await owner.closed).toMatchObject({ code: 4413 });
    expect(await guest.closed).toMatchObject({ code: 4413 });
    expect(await isWiped(roomId)).toBe(true);
  });

  test("binary frames close the room", async () => {
    const { owner, guest } = await pair();
    guest.send(new Uint8Array([1, 2, 3]).buffer);
    expect(await owner.closed).toMatchObject({ code: 4400 });
  });

  test("100 frames are forwarded; the 101st closes the room", async () => {
    const { roomId, owner, guest } = await pair();
    for (let i = 1; i <= 50; i++) guest.send(`g${i}`);
    for (let i = 1; i <= 50; i++) owner.send(`o${i}`);
    for (let i = 1; i <= 50; i++) expect(await owner.receive()).toBe(`g${i}`);
    for (let i = 1; i <= 50; i++) expect(await guest.receive()).toBe(`o${i}`);
    guest.send("one too many");
    expect(await owner.closed).toMatchObject({ code: 4429 });
    expect(await isWiped(roomId)).toBe(true);
  });
});

describe("hibernation", () => {
  test("sockets, rules and the frame count survive the Room hibernating", async () => {
    const { roomId, owner, guest } = await pair();
    for (let i = 1; i <= 60; i++) guest.send(`a${i}`);
    for (let i = 1; i <= 60; i++) await owner.receive();

    await evictDurableObject(room(roomId)); // the Room sleeps; its sockets stay open

    const second = await connect(roomId, "role=guest");
    expect(await second.closed).toMatchObject({ code: 4409 });
    for (let i = 61; i <= 100; i++) guest.send(`a${i}`);
    for (let i = 61; i <= 100; i++) expect(await owner.receive()).toBe(`a${i}`);
    guest.send("one too many");
    expect(await owner.closed).toMatchObject({ code: 4429 });
  });
});

describe("short life, no records", () => {
  test("the owner leaving before a guest joins deletes everything", async () => {
    const roomId = newRoomId();
    const owner = await connect(roomId, "role=owner&ttl=120");
    expect(await isWiped(roomId)).toBe(false);
    owner.close();
    await vi.waitFor(async () => expect(await isWiped(roomId)).toBe(true));
  });

  test("when one side leaves, the other is closed and everything is deleted", async () => {
    const { roomId, owner, guest } = await pair();
    guest.close();
    expect(await owner.closed).toMatchObject({ code: 1000 });
    await vi.waitFor(async () => expect(await isWiped(roomId)).toBe(true));
  });

  test("10 minutes after creation the Room closes and deletes everything", async () => {
    const { roomId, owner, guest } = await pair();
    const { alarm } = await stored(roomId);
    expect(alarm).toBeGreaterThan(Date.now() + 10 * 60 * 1000 - 5000);
    expect(alarm).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);

    expect(await runDurableObjectAlarm(room(roomId))).toBe(true);
    expect(await owner.closed).toMatchObject({ code: 4408 });
    expect(await guest.closed).toMatchObject({ code: 4408 });
    expect(await isWiped(roomId)).toBe(true);
  });
});
