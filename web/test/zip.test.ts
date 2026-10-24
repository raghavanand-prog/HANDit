import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { crc32 } from "../src/core/crc32";
import { buildZip, type ZipEntry } from "../src/core/zip";

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Unzips with Python's zipfile (which checks every CRC) and returns each entry's facts. */
async function unzipWithPython(zip: Blob) {
  const dir = mkdtempSync(join(tmpdir(), "handit-zip-"));
  try {
    const path = join(dir, "test.zip");
    writeFileSync(path, new Uint8Array(await zip.arrayBuffer()));
    const script = `
import hashlib, json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({i.filename: {"sha256": hashlib.sha256(z.read(i)).hexdigest(),
  "method": i.compress_type, "utf8": bool(i.flag_bits & 0x800)} for i in z.infolist()}))`;
    return JSON.parse(execFileSync("python3", ["-I", "-c", script, path]).toString()) as Record<
      string,
      { sha256: string; method: number; utf8: boolean }
    >;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fileEntry = (path: string, data: Uint8Array<ArrayBuffer>): ZipEntry => ({
  path,
  kind: "file",
  file: new Blob([data]),
  size: data.length,
  crc: crc32(data),
});

const contents: [string, Uint8Array<ArrayBuffer>][] = [
  ["empty.txt", new Uint8Array()],
  ["notes.txt", new TextEncoder().encode("Original quality, always.\n")],
  [
    "Holiday/Day 1/IMG_0042.HEIC",
    Uint8Array.from({ length: 3 * 1024 * 1024 }, (_, i) => (i * 13) % 256),
  ],
  ["école ಕನ್ನಡ 😀.txt", new TextEncoder().encode("unicode name")],
];

describe("crc32", () => {
  test("matches the standard check value and can be chained", () => {
    const data = new TextEncoder().encode("123456789");
    expect(crc32(data)).toBe(0xcbf43926);
    expect(crc32(data.subarray(4), crc32(data.subarray(0, 4)))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip (store method)", () => {
  test.each([false, true])("unzips to byte-identical files (ZIP64 forced: %s)", async (zip64) => {
    const entries = [
      ...contents.map(([path, data]) => fileEntry(path, data)),
      { path: "Holiday/empty folder", kind: "dir", size: 0, crc: 0 } satisfies ZipEntry,
    ];
    const unzipped = await unzipWithPython(buildZip(entries, { zip64 }));

    for (const [path, data] of contents) {
      expect(unzipped[path]).toEqual({ sha256: sha256(data), method: 0, utf8: true });
    }
    expect(unzipped["Holiday/empty folder/"]).toBeDefined();
    expect(Object.keys(unzipped)).toHaveLength(contents.length + 1);
  });

  test("the archive is exactly headers plus the original bytes (nothing compressed)", () => {
    const entries = contents.map(([path, data]) => fileEntry(path, data));
    const total = contents.reduce((sum, [, data]) => sum + data.length, 0);
    const zip = buildZip(entries);
    expect(zip.size).toBeGreaterThan(total);
    expect(zip.size - total).toBeLessThan(1024);
  });
});
