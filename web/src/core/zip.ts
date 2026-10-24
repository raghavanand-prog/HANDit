// A ZIP file with the store method (no compression), so every file inside stays
// byte-identical. Built as a Blob made of headers and the received files
// themselves: nothing is copied into memory, and the CRC of each file is already
// known from receiving it. Uses ZIP64 when sizes or offsets need it.
import { utf8 } from "./bytes";

export interface ZipEntry {
  /** Safe relative path with "/" separators. */
  path: string;
  kind: "file" | "dir";
  file?: Blob;
  size: number;
  crc: number;
}

const MAX32 = 0xffffffff;
const UTF8_FLAG = 0x0800;

function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Little-endian record writer. */
function record(size: number, fill: (view: DataView) => void): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
}

export function buildZip(
  entries: ZipEntry[],
  options: { date?: Date; zip64?: boolean } = {},
): Blob {
  const { time, day } = dosDateTime(options.date ?? new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8(entry.kind === "dir" ? `${entry.path}/` : entry.path);
    const size = entry.kind === "dir" ? 0 : entry.size;
    const zip64 = options.zip64 || size >= MAX32 || offset >= MAX32;
    const version = zip64 ? 45 : 20;
    const small = (n: number) => (zip64 ? MAX32 : n);

    const local = record(30 + name.length + (zip64 ? 20 : 0), (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, version, true);
      v.setUint16(6, UTF8_FLAG, true);
      v.setUint16(8, 0, true); // stored
      v.setUint16(10, time, true);
      v.setUint16(12, day, true);
      v.setUint32(14, entry.crc, true);
      v.setUint32(18, small(size), true);
      v.setUint32(22, small(size), true);
      v.setUint16(26, name.length, true);
      v.setUint16(28, zip64 ? 20 : 0, true);
      if (zip64) {
        const at = 30 + name.length;
        v.setUint16(at, 0x0001, true);
        v.setUint16(at + 2, 16, true);
        v.setBigUint64(at + 4, BigInt(size), true);
        v.setBigUint64(at + 12, BigInt(size), true);
      }
    });
    local.set(name, 30);

    const header = record(46 + name.length + (zip64 ? 28 : 0), (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, (3 << 8) | version, true); // made by: Unix
      v.setUint16(6, version, true);
      v.setUint16(8, UTF8_FLAG, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, time, true);
      v.setUint16(14, day, true);
      v.setUint32(16, entry.crc, true);
      v.setUint32(20, small(size), true);
      v.setUint32(24, small(size), true);
      v.setUint16(28, name.length, true);
      v.setUint16(30, zip64 ? 28 : 0, true);
      v.setUint32(38, entry.kind === "dir" ? (0o40755 << 16) | 0x10 : 0o100644 << 16, true);
      v.setUint32(42, small(offset), true);
      if (zip64) {
        const at = 46 + name.length;
        v.setUint16(at, 0x0001, true);
        v.setUint16(at + 2, 24, true);
        v.setBigUint64(at + 4, BigInt(size), true);
        v.setBigUint64(at + 12, BigInt(size), true);
        v.setBigUint64(at + 20, BigInt(offset), true);
      }
    });
    header.set(name, 46);

    parts.push(local);
    if (entry.kind === "file" && entry.file) parts.push(entry.file);
    central.push(header);
    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, h) => sum + h.length, 0);
  const zip64End =
    options.zip64 || entries.length >= 0xffff || offset >= MAX32 || centralSize >= MAX32;
  parts.push(...central);
  if (zip64End) {
    parts.push(
      record(56, (v) => {
        v.setUint32(0, 0x06064b50, true);
        v.setBigUint64(4, 44n, true);
        v.setUint16(12, (3 << 8) | 45, true);
        v.setUint16(14, 45, true);
        v.setBigUint64(24, BigInt(entries.length), true);
        v.setBigUint64(32, BigInt(entries.length), true);
        v.setBigUint64(40, BigInt(centralSize), true);
        v.setBigUint64(48, BigInt(offset), true);
      }),
      record(20, (v) => {
        v.setUint32(0, 0x07064b50, true);
        v.setBigUint64(8, BigInt(offset + centralSize), true);
        v.setUint32(16, 1, true);
      }),
    );
  }
  parts.push(
    record(22, (v) => {
      v.setUint32(0, 0x06054b50, true);
      v.setUint16(8, zip64End ? 0xffff : entries.length, true);
      v.setUint16(10, zip64End ? 0xffff : entries.length, true);
      v.setUint32(12, zip64End ? MAX32 : centralSize, true);
      v.setUint32(16, zip64End ? MAX32 : offset, true);
    }),
  );
  return new Blob(parts, { type: "application/zip" });
}
