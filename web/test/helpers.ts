// Test vectors: the secret 00 01 … 1f. The expected values below were computed
// independently with Python's hashlib, hmac and base64 modules (HKDF checked
// against RFC 5869 test case 1), not with the code under test.
export const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);
export const ROOM_ID = "2b0fa9bd5a001e782d9c724d97a2d2d6";
export const K_SEAL = "6629d285c55f73a98fd3c7fba36db62b4896a53d369c75c393f91792a94ad25a";
export const EXPIRES_AT = 0x6a0b1c2d;
export const PAYLOAD = "AQFqCxwtAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"; // version 1, SEND

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
}

// A small seeded random generator (mulberry32), so a failing fuzz case can be replayed.
export function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Replaces one character with a different one from `alphabet`.
export function mutate(text: string, random: () => number, alphabet = BASE64URL): string {
  const at = Math.floor(random() * text.length);
  let ch = text[at];
  while (ch === text[at]) ch = alphabet[Math.floor(random() * alphabet.length)];
  return text.slice(0, at) + ch + text.slice(at + 1);
}
