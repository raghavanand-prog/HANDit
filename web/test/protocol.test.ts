import { describe, expect, test } from "vitest";
import {
  type Control,
  MAX_CONTROL_BYTES,
  MAX_ITEMS,
  OfferAssembler,
  type OfferItem,
  parseControl,
  splitOffer,
} from "../src/core/protocol";

const ID = "0123456789abcdef0123456789abcdef";
const ROOT = "a".repeat(64);
const item = (i: number, path = `file-${i}.txt`, size = 10): OfferItem => ({
  i,
  path,
  size,
  kind: "file",
  type: "text/plain",
});

describe("parseControl", () => {
  test.each<Control>([
    { t: "offer", id: ID, files: 2, bytes: 20, parts: 1 },
    {
      t: "offer_items",
      id: ID,
      items: [item(0), { i: 1, path: "dir", size: 0, kind: "dir", type: "" }],
    },
    { t: "accept", id: ID },
    { t: "decline", id: ID, reason: "timeout" },
    { t: "file_start", i: 3 },
    { t: "file_end", i: 3, size: 0, root: ROOT },
    { t: "file_abort", i: 3, code: "SOURCE_UNREADABLE" },
    { t: "file_result", i: 3, ok: true },
    { t: "file_result", i: 3, ok: false, code: "INTEGRITY_FAILED" },
    { t: "done" },
    { t: "summary", ok: [0, 1], failed: [{ i: 2, code: "SOURCE_UNREADABLE" }] },
    { t: "cancel" },
    { t: "ping" },
    { t: "pong" },
  ])("accepts $t", (message) => {
    expect(parseControl(JSON.stringify(message))).toEqual(message);
  });

  test.each([
    ["not JSON", "{"],
    ["an unknown type", '{"t":"steal"}'],
    ["a short id", '{"t":"accept","id":"abc"}'],
    ["a negative index", '{"t":"file_start","i":-1}'],
    ["a fractional size", `{"t":"file_end","i":0,"size":1.5,"root":"${ROOT}"}`],
    ["an upper-case root", `{"t":"file_end","i":0,"size":1,"root":"${"A".repeat(64)}"}`],
    ["an unknown decline reason", `{"t":"decline","id":"${ID}","reason":"bored"}`],
    ["a failed result without a code", '{"t":"file_result","i":0,"ok":false}'],
    ["an unknown abort code", '{"t":"file_abort","i":0,"code":"NOPE"}'],
    [
      "an item of unknown kind",
      `{"t":"offer_items","id":"${ID}","items":[{"i":0,"path":"a","size":0,"kind":"link","type":""}]}`,
    ],
    ["a message over 64 KiB", JSON.stringify({ t: "cancel", pad: "x".repeat(MAX_CONTROL_BYTES) })],
  ])("rejects %s", (_, text) => {
    expect(parseControl(text)).toBeNull();
  });

  test("unknown extra fields are dropped", () => {
    expect(parseControl('{"t":"file_start","i":1,"evil":true}')).toEqual({ t: "file_start", i: 1 });
  });
});

describe("splitOffer and OfferAssembler", () => {
  test("a large list is split into parts of at most 64 KiB and reassembled in order", () => {
    const items = Array.from({ length: 3000 }, (_, i) =>
      item(i, `folder/${"n".repeat(40)}-${i}.jpg`),
    );
    const parts = splitOffer(ID, items);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(new TextEncoder().encode(JSON.stringify(part)).length).toBeLessThanOrEqual(
        MAX_CONTROL_BYTES,
      );
    }
    const assembler = new OfferAssembler({
      t: "offer",
      id: ID,
      files: 3000,
      bytes: 30_000,
      parts: parts.length,
    });
    let result: OfferItem[] | null = null;
    for (const part of parts) result = assembler.add(part);
    expect(result).toEqual(items);
  });

  const assemble =
    (items: OfferItem[], overrides: Partial<{ files: number; bytes: number }> = {}) =>
    () => {
      const files = items.filter((x) => x.kind === "file").length;
      const bytes = items.reduce((s, x) => s + x.size, 0);
      const offer = { t: "offer" as const, id: ID, files, bytes, parts: 1, ...overrides };
      return new OfferAssembler(offer).add({ t: "offer_items", id: ID, items });
    };

  test.each<[string, () => unknown]>([
    ["indices out of order", assemble([item(1), item(0)])],
    ["a file count that doesn't match", assemble([item(0)], { files: 2 })],
    ["a byte total that doesn't match", assemble([item(0)], { bytes: 99 })],
    ["a folder with a size", assemble([{ i: 0, path: "d", size: 5, kind: "dir", type: "" }])],
    ["a path over 4,096 bytes", assemble([item(0, "a".repeat(4097))])],
    ["a path more than 32 levels deep", assemble([item(0, `${"d/".repeat(32)}f`)])],
    [
      "more than 10,000 items",
      assemble(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => item(i, `f${i}`, 0))),
    ],
  ])("rejects %s", (_, run) => {
    expect(run).toThrow();
  });

  test("a part for a different transfer is rejected", () => {
    const assembler = new OfferAssembler({ t: "offer", id: ID, files: 1, bytes: 10, parts: 1 });
    expect(() =>
      assembler.add({ t: "offer_items", id: "f".repeat(32), items: [item(0)] }),
    ).toThrow();
  });
});

describe("what a sender may put in an offer is bounded (S7)", () => {
  const withType = (type: string) =>
    parseControl(
      JSON.stringify({
        t: "offer_items",
        id: ID,
        items: [{ i: 0, path: "a", size: 1, kind: "file", type }],
      }),
    );

  test.each(["", "image/heic", "video/quicktime", "text/plain; charset=utf-8"])(
    "the type %j is accepted",
    (type) => {
      expect(withType(type)).not.toBeNull();
    },
  );

  test.each([
    ["longer than 127 characters", `image/${"x".repeat(200)}`],
    ["with a control character", "image/png\u0000"],
    ["with a newline", "image/png\n"],
    ["with non-ASCII text", "image/\u202epng"],
    ["with an emoji", "image/\u{1F600}"],
  ])("a type %s is refused", (_, type) => {
    expect(withType(type)).toBeNull();
  });

  test("an offer whose paths add up to more than 8 MiB is refused before Accept", () => {
    const longPath = (i: number) => `${"d".repeat(4000)}${i}`;
    const items = Array.from({ length: 2200 }, (_, i) => item(i, longPath(i), 1));
    const parts = splitOffer(ID, items);
    const assembler = new OfferAssembler({
      t: "offer",
      id: ID,
      files: items.length,
      bytes: items.length,
      parts: parts.length,
    });
    expect(() => {
      for (const part of parts) assembler.add(part);
    }).toThrow(/too large/);
  });

  test("a large honest offer is still fine: 10,000 files with 200-byte paths", () => {
    const items = Array.from({ length: MAX_ITEMS }, (_, i) =>
      item(i, `Holiday/${"n".repeat(180)}-${i}.jpg`, 1),
    );
    const parts = splitOffer(ID, items);
    const assembler = new OfferAssembler({
      t: "offer",
      id: ID,
      files: MAX_ITEMS,
      bytes: MAX_ITEMS,
      parts: parts.length,
    });
    let result: OfferItem[] | null = null;
    for (const part of parts) result = assembler.add(part);
    expect(result).toHaveLength(MAX_ITEMS);
  });
});
