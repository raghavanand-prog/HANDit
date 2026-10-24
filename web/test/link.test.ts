import { describe, expect, test } from "vitest";
import { toBase64url } from "../src/core/bytes";
import {
  encodeLink,
  type Link,
  Mode,
  newSecret,
  parseFragment,
  roomIdFor,
  takeLinkFromAddressBar,
} from "../src/core/link";
import { BASE64URL, EXPIRES_AT, mutate, PAYLOAD, ROOM_ID, SECRET, seededRandom } from "./helpers";

const ORIGIN = "https://handit.example";
const payload = (bytes: number[]) => toBase64url(new Uint8Array(bytes));
const zeros = (n: number) => new Array<number>(n).fill(0);

describe("encodeLink", () => {
  test("produces <origin>/j#<51-character payload> matching the known vector", () => {
    const url = encodeLink(ORIGIN, { mode: Mode.SEND, expiresAt: EXPIRES_AT, secret: SECRET });
    expect(url).toBe(`${ORIGIN}/j#${PAYLOAD}`);
    expect(PAYLOAD).toHaveLength(51);
  });

  test.each<[string, Partial<Link>]>([
    ["a 31-byte secret", { secret: new Uint8Array(31) }],
    ["an unknown mode", { mode: 3 as Mode }],
    ["a negative expiry", { expiresAt: -1 }],
    ["a fractional expiry", { expiresAt: 1.5 }],
    ["an expiry past 32 bits", { expiresAt: 2 ** 32 }],
  ])("refuses %s", (_, change) => {
    const link = { mode: Mode.SEND, expiresAt: EXPIRES_AT, secret: SECRET, ...change };
    expect(() => encodeLink(ORIGIN, link)).toThrow(RangeError);
  });
});

describe("parseFragment", () => {
  test.each([Mode.SEND, Mode.RECEIVE])("round-trips mode %i", (mode) => {
    const secret = newSecret();
    const url = encodeLink(ORIGIN, { mode, expiresAt: EXPIRES_AT, secret });
    const fragment = new URL(url).hash;
    expect(parseFragment(fragment)).toEqual({
      ok: true,
      link: { mode, expiresAt: EXPIRES_AT, secret },
    });
  });

  test("accepts the fragment with or without #", () => {
    expect(parseFragment(PAYLOAD)).toEqual(parseFragment(`#${PAYLOAD}`));
    expect(parseFragment(PAYLOAD).ok).toBe(true);
  });

  test.each([0, 2, 255])("version %i is LINK_UNSUPPORTED_VERSION", (version) => {
    expect(parseFragment(payload([version, 1, ...zeros(36)]))).toEqual({
      ok: false,
      code: "LINK_UNSUPPORTED_VERSION",
    });
  });

  test.each([
    ["1 byte", [1]],
    ["37 bytes", [1, 1, ...zeros(35)]],
    ["39 bytes", [1, 1, ...zeros(37)]],
    ["mode 0", [1, 0, ...zeros(36)]],
    ["mode 3", [1, 3, ...zeros(36)]],
  ])("%s is LINK_INVALID", (_, bytes) => {
    expect(parseFragment(payload(bytes))).toEqual({ ok: false, code: "LINK_INVALID" });
  });

  test.each([
    ["empty", ""],
    ["just #", "#"],
    ["padding", `${PAYLOAD}=`],
    ["standard base64", PAYLOAD.replace("A", "+")],
    ["non-canonical last character", `${PAYLOAD.slice(0, -1)}9`],
    ["very long", "A".repeat(100_000)],
  ])("%s is LINK_INVALID", (_, fragment) => {
    expect(parseFragment(fragment)).toEqual({ ok: false, code: "LINK_INVALID" });
  });

  test("10,000 random and damaged links never crash the parser", () => {
    const random = seededRandom(2026);
    const pick = (alphabet: string, length: number) =>
      Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
    const anyChars = (length: number) =>
      String.fromCharCode(...Array.from({ length }, () => Math.floor(random() * 0x10000)));
    const randomBytes = (length: number) =>
      Array.from({ length }, () => Math.floor(random() * 256));

    for (let i = 0; i < 10_000; i++) {
      const length = Math.floor(random() * 80);
      const input = [
        () => pick(BASE64URL, length),
        () => anyChars(length),
        () => payload([1, ...randomBytes(length)]),
        () => mutate(PAYLOAD, random),
        () => PAYLOAD.slice(0, length),
      ][i % 5]?.() as string;

      const result = parseFragment(input);
      if (result.ok) {
        expect(result.link.secret).toHaveLength(32);
        expect([Mode.SEND, Mode.RECEIVE]).toContain(result.link.mode);
        expect(Number.isInteger(result.link.expiresAt)).toBe(true);
      } else {
        expect(["LINK_INVALID", "LINK_UNSUPPORTED_VERSION"]).toContain(result.code);
      }
    }
  });
});

describe("takeLinkFromAddressBar", () => {
  const addressBar = (hash: string) => {
    const urls: string[] = [];
    const result = takeLinkFromAddressBar(
      { hash },
      { replaceState: (_, __, url) => urls.push(url) },
    );
    return { result, urls };
  };

  test("reads the link, then replaces the address with /j", () => {
    const { result, urls } = addressBar(`#${PAYLOAD}`);
    expect(result.ok).toBe(true);
    expect(urls).toEqual(["/j"]);
  });

  test("clears the address bar even when the link is broken", () => {
    const { result, urls } = addressBar("#broken");
    expect(result).toEqual({ ok: false, code: "LINK_INVALID" });
    expect(urls).toEqual(["/j"]);
  });
});

describe("secrets and room IDs", () => {
  test("newSecret returns 32 fresh random bytes", () => {
    expect(newSecret()).toHaveLength(32);
    expect(newSecret()).not.toEqual(newSecret());
  });

  test("room_id is the first 16 bytes of SHA-256('handit/v1/room' ‖ secret), as hex", async () => {
    expect(await roomIdFor(SECRET)).toBe(ROOM_ID);
  });

  test("different secrets give different room IDs", async () => {
    const ids = await Promise.all([newSecret(), newSecret()].map(roomIdFor));
    expect(ids[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
