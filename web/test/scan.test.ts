import { describe, expect, test } from "vitest";
import { Mode } from "../src/core/link";
import { linkFromScan } from "../src/core/scan";
import { EXPIRES_AT, PAYLOAD, SECRET } from "./helpers";

const ORIGIN = "https://handit.example";

describe("linkFromScan", () => {
  test("a HANDit link from this site is accepted", () => {
    const result = linkFromScan(`${ORIGIN}/j#${PAYLOAD}`, ORIGIN);
    expect(result).toEqual({
      ok: true,
      link: { mode: Mode.SEND, expiresAt: EXPIRES_AT, secret: SECRET },
    });
  });

  test.each([
    ["another site", `https://evil.example/j#${PAYLOAD}`],
    ["a look-alike host", `https://handit.example.evil.example/j#${PAYLOAD}`],
    ["another scheme", `http://handit.example/j#${PAYLOAD}`],
    ["another path", `${ORIGIN}/send#${PAYLOAD}`],
    ["plain text", "hello"],
    ["a Wi-Fi code", "WIFI:T:WPA;S:cafe;P:secret;;"],
    ["a link with no fragment", `${ORIGIN}/j`],
    ["an empty string", ""],
  ])("%s is not ours (null: keep scanning)", (_, text) => {
    expect(linkFromScan(text, ORIGIN)).toBeNull();
  });

  test("our link with a damaged code says why", () => {
    expect(linkFromScan(`${ORIGIN}/j#broken`, ORIGIN)).toEqual({ ok: false, code: "LINK_INVALID" });
    const newer = Buffer.from([2, 1, ...new Array<number>(36).fill(0)]).toString("base64url");
    expect(linkFromScan(`${ORIGIN}/j#${newer}`, ORIGIN)).toEqual({
      ok: false,
      code: "LINK_UNSUPPORTED_VERSION",
    });
  });
});
