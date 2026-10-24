// Small byte helpers. Hand-written base64url so every supported browser behaves the same.
export type Bytes = Uint8Array<ArrayBuffer>;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url without padding (RFC 4648 §5). */
export function toBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(3, bytes.length - i) + 1;
    for (let j = 0; j < chars; j++) out += ALPHABET[(chunk >> (18 - 6 * j)) & 63];
  }
  return out;
}

/** Strict decoder: base64url alphabet only, no padding, canonical. Returns null otherwise. */
export function fromBase64url(text: string): Bytes | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let value = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < text.length; i++) {
    const digit = ALPHABET.indexOf(text.charAt(i));
    if (digit < 0) return null;
    value = ((value << 6) | digit) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  // Leftover bits must be zero, so each byte string has exactly one encoding.
  return (value & ((1 << bits) - 1)) === 0 ? out : null;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
