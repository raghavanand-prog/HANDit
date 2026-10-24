import { describe, expect, test } from "vitest";
import { concat, fromBase64url, toBase64url, toHex, utf8 } from "../src/core/bytes";
import { seededRandom } from "./helpers";

// Reference encoder built on the browser's own btoa.
const reference = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

describe("base64url", () => {
  test("round-trips every length from 0 to 64 bytes and matches btoa", () => {
    const random = seededRandom(1);
    for (let length = 0; length <= 64; length++) {
      const bytes = Uint8Array.from({ length }, () => Math.floor(random() * 256));
      const text = toBase64url(bytes);
      expect(text).toBe(reference(bytes));
      expect(fromBase64url(text)).toEqual(bytes);
    }
  });

  test.each([
    ["padding", "AA=="],
    ["standard base64 +", "AA+A"],
    ["standard base64 /", "AA/A"],
    ["a space", "AA A"],
    ["a non-ASCII letter", "AAé"],
    ["an impossible length", "AAAAA"],
    ["non-zero leftover bits", "AB"],
  ])("rejects %s", (_, text) => {
    expect(fromBase64url(text)).toBeNull();
  });
});

test("toHex, utf8 and concat", () => {
  expect(toHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  expect(concat(utf8("ab"), new Uint8Array([1]), new Uint8Array())).toEqual(
    new Uint8Array([97, 98, 1]),
  );
});
