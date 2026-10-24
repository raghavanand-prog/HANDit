import { describe, expect, test } from "vitest";
import { toBase64url, utf8 } from "../src/core/bytes";
import { newSecret } from "../src/core/link";
import { createSeal, type IntroMessage, MAX_FRAME_BYTES, type Role } from "../src/core/seal";
import { fromHex, K_SEAL, mutate, ROOM_ID, SECRET, seededRandom } from "./helpers";

const hello: IntroMessage = { t: "hello", v: 1, name: "Pixel 8", ua: "Chrome on Android" };
const welcome: IntroMessage = { t: "welcome", v: 1, name: "Mac", ua: "Safari on Mac", mode: 1 };
const bye: IntroMessage = { t: "bye" };

const seals = async (secret = SECRET, roomId = ROOM_ID) => ({
  owner: await createSeal(secret, roomId, "owner"),
  guest: await createSeal(secret, roomId, "guest"),
});

type Frame = { r: Role; n: number; iv: string; ct: string };
const edit = (frame: string, change: (f: Frame) => void) => {
  const parsed = JSON.parse(frame) as Frame;
  change(parsed);
  return JSON.stringify(parsed);
};

const TAMPERED = { ok: false, reason: "tampered" };

describe("sealing and opening", () => {
  test("uses k_seal = HKDF-SHA-256(secret, 'handit/v1', 'seal') and AAD = room_id ‖ r ‖ n", async () => {
    // Build a frame by hand with the independently computed key, then let the code open it.
    const key = await crypto.subtle.importKey("raw", fromHex(K_SEAL), "AES-GCM", false, [
      "encrypt",
    ]);
    const iv = new Uint8Array(12).fill(7);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: utf8(`${ROOM_ID}owner1`) },
      key,
      utf8(JSON.stringify(welcome)),
    );
    const frame = JSON.stringify({
      r: "owner",
      n: 1,
      iv: toBase64url(iv),
      ct: toBase64url(new Uint8Array(ct)),
    });
    const { guest } = await seals();
    expect(await guest.open(frame)).toEqual({ ok: true, message: welcome });
  });

  test("every introduction message round-trips", async () => {
    const { owner, guest } = await seals();
    const fromGuest: IntroMessage[] = [
      hello,
      { t: "sdp", type: "answer", sdp: "v=0\r\n" },
      { t: "ice", candidate: "", sdpMid: null, sdpMLineIndex: null },
      bye,
    ];
    const fromOwner: IntroMessage[] = [
      welcome,
      { t: "sdp", type: "offer", sdp: "v=0\r\n" },
      {
        t: "ice",
        candidate: "candidate:1 1 udp 1 192.0.2.1 9 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
      bye,
    ];
    for (const message of fromGuest) {
      expect(await owner.open(await guest.seal(message))).toEqual({ ok: true, message });
    }
    for (const message of fromOwner) {
      expect(await guest.open(await owner.seal(message))).toEqual({ ok: true, message });
    }
  });

  test("frames carry only r, n, iv and ct — numbered from 1, nothing readable", async () => {
    const { guest } = await seals();
    const frames = [await guest.seal(hello), await guest.seal(bye)];
    const parsed = frames.map((f) => JSON.parse(f) as Frame);
    expect(parsed.map((f) => Object.keys(f).sort())).toEqual([
      ["ct", "iv", "n", "r"],
      ["ct", "iv", "n", "r"],
    ]);
    expect(parsed.map((f) => [f.r, f.n])).toEqual([
      ["guest", 1],
      ["guest", 2],
    ]);
    expect(parsed[0]?.iv).toHaveLength(16); // 12 bytes
    expect(frames[0]).not.toContain("Pixel");
  });

  test("sealing the same message twice gives different frames (fresh IV)", async () => {
    const { guest } = await seals();
    const a = JSON.parse(await guest.seal(hello)) as Frame;
    const b = JSON.parse(await guest.seal(hello)) as Frame;
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  test("frames come out and are opened in call order, even when calls overlap", async () => {
    const { owner, guest } = await seals();
    const frames = await Promise.all([guest.seal(hello), guest.seal(bye)]);
    expect(frames.map((f) => (JSON.parse(f) as Frame).n)).toEqual([1, 2]);
    const results = await Promise.all(frames.map((f) => owner.open(f)));
    expect(results.every((r) => r.ok)).toBe(true);
  });

  test("a frame over 32 KiB can't be sealed", async () => {
    const { owner } = await seals();
    const big: IntroMessage = { t: "sdp", type: "offer", sdp: "x".repeat(MAX_FRAME_BYTES) };
    await expect(owner.seal(big)).rejects.toThrow(RangeError);
  });
});

describe("tampering is detected (S3)", () => {
  test("changing any single character of the ciphertext", async () => {
    const { owner, guest } = await seals();
    const frame = await guest.seal(hello);
    const { ct } = JSON.parse(frame) as Frame;
    for (let at = 0; at < ct.length; at++) {
      const changed = edit(frame, (f) => {
        f.ct = ct.slice(0, at) + (ct[at] === "A" ? "B" : "A") + ct.slice(at + 1);
      });
      expect(await owner.open(changed)).toEqual(TAMPERED);
    }
    expect((await owner.open(frame)).ok).toBe(true); // the original still opens
  });

  test.each<[string, (f: Frame) => void]>([
    ["the IV", (f) => (f.iv = mutate(f.iv, seededRandom(3)))],
    ["the sequence number", (f) => (f.n = 2)],
    ["the role", (f) => (f.r = "owner")],
  ])("changing %s", async (_, change) => {
    const { owner, guest } = await seals();
    expect(await owner.open(edit(await guest.seal(hello), change))).toEqual(TAMPERED);
  });

  test("a frame sealed with a different secret (wrong key)", async () => {
    const owner = await createSeal(SECRET, ROOM_ID, "owner");
    const stranger = await createSeal(newSecret(), ROOM_ID, "guest");
    expect(await owner.open(await stranger.seal(hello))).toEqual(TAMPERED);
  });

  test("a frame sealed for a different room", async () => {
    const owner = await createSeal(SECRET, ROOM_ID, "owner");
    const elsewhere = await createSeal(SECRET, "f".repeat(32), "guest");
    expect(await owner.open(await elsewhere.seal(hello))).toEqual(TAMPERED);
  });

  test("a side's own frame reflected back to it", async () => {
    const { owner } = await seals();
    expect(await owner.open(await owner.seal(welcome))).toEqual(TAMPERED);
  });

  test.each<[string, string | ((frame: string) => string)]>([
    ["an empty frame", ""],
    ["text that isn't JSON", "hello"],
    ["JSON that isn't an object", "[1,2]"],
    ["a missing field", (f) => edit(f, (x) => delete (x as Partial<Frame>).ct)],
    ["an extra field", (f) => edit(f, (x) => Object.assign(x, { extra: 1 }))],
    ["n = 0", (f) => edit(f, (x) => (x.n = 0))],
    ["n = 1.5", (f) => edit(f, (x) => (x.n = 1.5))],
    ["n as text", (f) => edit(f, (x) => Object.assign(x, { n: "1" }))],
    ["an unknown role", (f) => edit(f, (x) => Object.assign(x, { r: "server" }))],
    ["an 11-byte IV", (f) => edit(f, (x) => (x.iv = toBase64url(new Uint8Array(11))))],
    ["ciphertext shorter than the tag", (f) => edit(f, (x) => (x.ct = "AAAA"))],
    ["ciphertext that isn't base64url", (f) => edit(f, (x) => (x.ct = `${x.ct}=`))],
    ["a frame over 32 KiB", (f) => edit(f, (x) => (x.ct += "A".repeat(MAX_FRAME_BYTES)))],
  ])("%s", async (_, make) => {
    const { owner, guest } = await seals();
    const frame = typeof make === "string" ? make : make(await guest.seal(hello));
    expect(await owner.open(frame)).toEqual(TAMPERED);
  });

  test("1,000 random and damaged frames never crash or open", async () => {
    const random = seededRandom(42);
    const { owner, guest } = await seals();
    const frame = await guest.seal(hello);
    const any = '{}[]":,0123456789.-abcdefghijklmnopqrstuvwxyz ABCXYZ_\\';
    for (let i = 0; i < 1000; i++) {
      const input = i % 2 ? mutate(frame, random, any) : mutate(any.repeat(3), random, any);
      expect((await owner.open(input)).ok).toBe(false);
    }
    expect((await owner.open(frame)).ok).toBe(true);
  });
});

describe("replays are rejected (S4)", () => {
  test("the same frame twice", async () => {
    const { owner, guest } = await seals();
    const frame = await guest.seal(hello);
    expect((await owner.open(frame)).ok).toBe(true);
    expect(await owner.open(frame)).toEqual({ ok: false, reason: "replayed" });
  });

  test("an older frame after a newer one", async () => {
    const { owner, guest } = await seals();
    const first = await guest.seal(hello);
    const second = await guest.seal({ t: "sdp", type: "answer", sdp: "v=0" });
    expect((await owner.open(second)).ok).toBe(true);
    expect(await owner.open(first)).toEqual({ ok: false, reason: "replayed" });
  });

  test("anything after bye", async () => {
    const { owner, guest } = await seals();
    const byeFrame = await guest.seal(bye);
    expect(await owner.open(byeFrame)).toEqual({ ok: true, message: bye });
    await expect(guest.seal(hello)).rejects.toThrow();

    // A frame the guest made earlier but the Room held back until after bye.
    const other = await seals();
    const early = await other.guest.seal(hello);
    expect((await other.owner.open(await other.guest.seal(bye))).ok).toBe(true);
    expect(await other.owner.open(early)).toEqual({ ok: false, reason: "after-bye" });
  });
});

describe("authentic frames with an invalid message", () => {
  test.each<[string, unknown]>([
    ["an unknown type", { t: "steal" }],
    ["hello without a name", { t: "hello", v: 1, ua: "x" }],
    ["v as text", { t: "hello", v: "1", name: "a", ua: "b" }],
    ["welcome with mode 3", { ...welcome, mode: 3 }],
    ["sdp of type pranswer", { t: "sdp", type: "pranswer", sdp: "v=0" }],
    [
      "ice with a negative line index",
      { t: "ice", candidate: "", sdpMid: null, sdpMLineIndex: -1 },
    ],
    ["a bare string", "hello"],
  ])("%s is invalid", async (_, message) => {
    const { owner, guest } = await seals();
    expect(await owner.open(await guest.seal(message as IntroMessage))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  test("unknown extra fields are dropped", async () => {
    const { owner, guest } = await seals();
    const frame = await guest.seal({ ...hello, admin: true } as IntroMessage);
    expect(await owner.open(frame)).toEqual({ ok: true, message: hello });
  });
});
