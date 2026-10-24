import { expect, test } from "vitest";
import { BLOCK_BYTES, BlockHasher } from "../src/core/hash";
import { seededRandom } from "./helpers";

const pattern = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 251);
const rootOf = async (data: Uint8Array, chunk = data.length || 1) => {
  const hasher = new BlockHasher();
  for (let o = 0; o < data.length; o += chunk) await hasher.update(data.subarray(o, o + chunk));
  return hasher.root();
};

// root = SHA-256(size as 8 bytes ‖ block size as 4 bytes ‖ h_0 ‖ … ‖ h_n-1), computed
// independently with Python's hashlib.
test.each([
  [
    "an empty file (no blocks)",
    0,
    "da1e758bead73354ccc8db47bde0fb99ee70fe3a07eb655486c9fce95ab68320",
  ],
  [
    "exactly one block",
    BLOCK_BYTES,
    "d4b22a15f92e355b6482454bc3cd56a1efb9e431bba4f3c15b3d0b98c55479cd",
  ],
  [
    "2.5 blocks",
    (BLOCK_BYTES * 5) / 2,
    "396f0de61e274aad1fdeea7fd9d0ff59d76be17703762510b4305f5c47b69afa",
  ],
])("the root of %s matches the known value", async (_, size, expected) => {
  expect(await rootOf(pattern(size))).toBe(expected);
});

test("a one-byte file", async () => {
  expect(await rootOf(new Uint8Array([0x2a]))).toBe(
    "48824140f1ba0766f719188bf730e5bb4186236ca2419d9eb918e0cdd479e1b0",
  );
});

test("the root doesn't depend on how the bytes are split into chunks", async () => {
  const data = pattern((BLOCK_BYTES * 5) / 2);
  const random = seededRandom(7);
  const hasher = new BlockHasher();
  for (let o = 0; o < data.length; ) {
    const n = 1 + Math.floor(random() * 200_000);
    await hasher.update(data.subarray(o, o + n));
    o += n;
  }
  expect(await hasher.root()).toBe(await rootOf(data, 65_536));
  expect(hasher.size).toBe(data.length);
});

test("one changed byte changes the root", async () => {
  const data = pattern(3 * BLOCK_BYTES);
  const changed = data.slice();
  changed[2 * BLOCK_BYTES + 5] = (changed[2 * BLOCK_BYTES + 5] ?? 0) ^ 1;
  expect(await rootOf(changed)).not.toBe(await rootOf(data));
});
