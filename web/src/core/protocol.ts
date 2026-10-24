// Messages on the data channel. Control messages are JSON text with a `t` field;
// file data travels as binary messages of at most 64 KiB.

export const CHUNK_BYTES = 64 * 1024;
export const MAX_CONTROL_BYTES = 64 * 1024;
export const MAX_ITEMS = 10_000;
export const MAX_PATH_BYTES = 4096;
export const MAX_DEPTH = 32;

export interface OfferItem {
  i: number;
  /** Relative path with "/" separators. */
  path: string;
  size: number;
  kind: "file" | "dir";
  /** MIME type as the sender's browser reported it (may be empty). */
  type: string;
}

export type FileFailCode = "INTEGRITY_FAILED" | "SOURCE_UNREADABLE";

export type Control =
  | { t: "offer"; id: string; files: number; bytes: number; parts: number }
  | { t: "offer_items"; id: string; items: OfferItem[] }
  | { t: "accept"; id: string }
  | { t: "decline"; id: string; reason: "user" | "timeout" | "space" }
  | { t: "file_start"; i: number }
  | { t: "file_end"; i: number; size: number; root: string }
  | { t: "file_abort"; i: number; code: "SOURCE_UNREADABLE" }
  | { t: "file_result"; i: number; ok: true }
  | { t: "file_result"; i: number; ok: false; code: FileFailCode }
  | { t: "done" }
  | { t: "summary"; ok: number[]; failed: { i: number; code: FileFailCode }[] }
  | { t: "cancel" }
  | { t: "ping" }
  | { t: "pong" };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isIndex = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
const isRoot = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const isFailCode = (v: unknown): v is FileFailCode =>
  v === "INTEGRITY_FAILED" || v === "SOURCE_UNREADABLE";

function parseItem(v: unknown): OfferItem | null {
  if (!isRecord(v)) return null;
  const { i, path, size, kind, type } = v;
  if (!isIndex(i) || typeof path !== "string" || !isIndex(size) || typeof type !== "string") {
    return null;
  }
  if (kind !== "file" && kind !== "dir") return null;
  return { i, path, size, kind, type };
}

/** Parses a control message strictly. Unknown fields are dropped; anything malformed is null. */
export function parseControl(text: string): Control | null {
  if (text.length > MAX_CONTROL_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(m)) return null;
  switch (m.t) {
    case "offer":
      return isId(m.id) && isIndex(m.files) && isIndex(m.bytes) && isIndex(m.parts)
        ? { t: "offer", id: m.id, files: m.files, bytes: m.bytes, parts: m.parts }
        : null;
    case "offer_items": {
      if (!isId(m.id) || !Array.isArray(m.items)) return null;
      const items = m.items.map(parseItem);
      return items.every((x) => x !== null)
        ? { t: "offer_items", id: m.id, items: items as OfferItem[] }
        : null;
    }
    case "accept":
      return isId(m.id) ? { t: "accept", id: m.id } : null;
    case "decline":
      return isId(m.id) && (m.reason === "user" || m.reason === "timeout" || m.reason === "space")
        ? { t: "decline", id: m.id, reason: m.reason }
        : null;
    case "file_start":
      return isIndex(m.i) ? { t: "file_start", i: m.i } : null;
    case "file_end":
      return isIndex(m.i) && isIndex(m.size) && isRoot(m.root)
        ? { t: "file_end", i: m.i, size: m.size, root: m.root }
        : null;
    case "file_abort":
      return isIndex(m.i) && m.code === "SOURCE_UNREADABLE"
        ? { t: "file_abort", i: m.i, code: m.code }
        : null;
    case "file_result":
      if (!isIndex(m.i)) return null;
      if (m.ok === true) return { t: "file_result", i: m.i, ok: true };
      return m.ok === false && isFailCode(m.code)
        ? { t: "file_result", i: m.i, ok: false, code: m.code }
        : null;
    case "summary": {
      if (!Array.isArray(m.ok) || !Array.isArray(m.failed) || !m.ok.every(isIndex)) return null;
      const failed = m.failed.map((f) =>
        isRecord(f) && isIndex(f.i) && isFailCode(f.code) ? { i: f.i, code: f.code } : null,
      );
      return failed.every((f) => f !== null)
        ? { t: "summary", ok: m.ok, failed: failed as { i: number; code: FileFailCode }[] }
        : null;
    }
    case "done":
    case "cancel":
    case "ping":
    case "pong":
      return { t: m.t };
    default:
      return null;
  }
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Splits the file list into offer_items messages of at most 64 KiB each. */
export type OfferPart = Extract<Control, { t: "offer_items" }>;

export function splitOffer(id: string, items: OfferItem[]): OfferPart[] {
  const parts: OfferPart[] = [];
  const empty = byteLength(JSON.stringify({ t: "offer_items", id, items: [] }));
  let current: OfferItem[] = [];
  let size = empty;
  for (const item of items) {
    const itemSize = byteLength(JSON.stringify(item)) + 1;
    if (current.length > 0 && size + itemSize > MAX_CONTROL_BYTES) {
      parts.push({ t: "offer_items", id, items: current });
      current = [];
      size = empty;
    }
    current.push(item);
    size += itemSize;
  }
  if (current.length > 0 || parts.length === 0)
    parts.push({ t: "offer_items", id, items: current });
  return parts;
}

/** Collects an offer and its parts on the recipient, checking the protocol's limits. */
export class OfferAssembler {
  private items: OfferItem[] = [];
  private received = 0;

  constructor(readonly offer: Extract<Control, { t: "offer" }>) {
    if (offer.parts < 1 || offer.parts > MAX_ITEMS || offer.files > MAX_ITEMS) {
      throw new Error("offer out of range");
    }
  }

  /** Adds one part; returns the complete, checked list after the last one. */
  add(part: OfferPart): OfferItem[] | null {
    if (part.id !== this.offer.id || this.received >= this.offer.parts) {
      throw new Error("unexpected offer part");
    }
    this.received++;
    for (const item of part.items) {
      if (item.i !== this.items.length || this.items.length >= MAX_ITEMS) {
        throw new Error("item out of order or over the limit");
      }
      if (item.kind === "dir" && item.size !== 0) throw new Error("folder with a size");
      if (byteLength(item.path) > MAX_PATH_BYTES || item.path.split("/").length > MAX_DEPTH) {
        throw new Error("path too long or too deep");
      }
      this.items.push(item);
    }
    if (this.received < this.offer.parts) return null;

    const files = this.items.filter((x) => x.kind === "file");
    const bytes = files.reduce((sum, x) => sum + x.size, 0);
    if (files.length !== this.offer.files || bytes !== this.offer.bytes) {
      throw new Error("offer totals don't match its items");
    }
    return this.items;
  }
}
