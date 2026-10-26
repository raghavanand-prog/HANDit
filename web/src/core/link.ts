// The link: https://<site>/j#<payload>. The payload lives in the fragment, which
// browsers never send to a server, and holds the code's secret.
import { type Bytes, concat, fromBase64url, toBase64url, toHex, utf8 } from "./bytes";

export const Mode = { SEND: 1, RECEIVE: 2 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export interface Link {
  mode: Mode;
  /** Unix time in seconds. Advisory: the Room decides when a code expires. */
  expiresAt: number;
  secret: Bytes;
}

export type LinkResult =
  | { ok: true; link: Link }
  | { ok: false; code: "LINK_INVALID" | "LINK_UNSUPPORTED_VERSION" };

const VERSION = 1;
const SECRET_BYTES = 32;
const PAYLOAD_BYTES = 38; // version 1 + mode 1 + expires_at 4 + secret 32
const MAX_FRAGMENT = 1024; // far longer than any version needs; stops absurd input early

const isMode = (value: number): value is Mode => value === Mode.SEND || value === Mode.RECEIVE;

export function newSecret(): Bytes {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

export function encodeLink(origin: string, { mode, expiresAt, secret }: Link): string {
  if (!isMode(mode)) throw new RangeError("Unknown mode");
  if (!Number.isInteger(expiresAt) || expiresAt < 0 || expiresAt > 0xffffffff) {
    throw new RangeError("expiresAt must fit in 32 bits");
  }
  if (secret.length !== SECRET_BYTES) throw new RangeError("The secret must be 32 bytes");

  const payload = new Uint8Array(PAYLOAD_BYTES);
  const view = new DataView(payload.buffer);
  view.setUint8(0, VERSION);
  view.setUint8(1, mode);
  view.setUint32(2, expiresAt); // big-endian
  payload.set(secret, 6);
  return `${origin}/j#${toBase64url(payload)}`;
}

/** Parses a link fragment, with or without the leading #. Never throws. */
export function parseFragment(fragment: string): LinkResult {
  const text = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const payload = text.length <= MAX_FRAGMENT ? fromBase64url(text) : null;
  if (!payload || payload.length === 0) return { ok: false, code: "LINK_INVALID" };
  // Version first: a newer version may have a different length.
  if (payload[0] !== VERSION) return { ok: false, code: "LINK_UNSUPPORTED_VERSION" };

  const view = new DataView(payload.buffer);
  const mode = payload[1] ?? 0;
  if (payload.length !== PAYLOAD_BYTES || !isMode(mode)) {
    return { ok: false, code: "LINK_INVALID" };
  }
  return {
    ok: true,
    link: { mode, expiresAt: view.getUint32(2), secret: payload.slice(6) },
  };
}

/** Whether a fragment is the length of a HANDit link, as opposed to an ordinary anchor like "#main". */
export const looksLikeLink = (hash: string) => /^#[A-Za-z0-9_-]{40,1100}$/.test(hash);

/** Reads the link from the address bar, then replaces the address with /j so the secret doesn't stay there. */
export function takeLinkFromAddressBar(
  location: { hash: string },
  history: { replaceState(data: unknown, unused: string, url: string): void },
): LinkResult {
  const result = parseFragment(location.hash);
  history.replaceState(null, "", "/j");
  return result;
}

/** room_id = first 16 bytes of SHA-256("handit/v1/room" ‖ secret), as 32 hex characters. */
export async function roomIdFor(secret: Bytes): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", concat(utf8("handit/v1/room"), secret));
  return toHex(new Uint8Array(digest, 0, 16));
}
