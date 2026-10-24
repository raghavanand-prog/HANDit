// CRC-32 (the checksum ZIP files require), computed while files are received.
const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 of `data`, continuing from `previous` (the CRC of the bytes before it). */
export function crc32(data: Uint8Array, previous = 0): number {
  let c = previous ^ 0xffffffff;
  for (let i = 0; i < data.length; i++)
    c = (TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
