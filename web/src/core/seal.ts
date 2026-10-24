// Sealed introduction messages. Everything the two browsers send through the Room
// is encrypted and authenticated (AES-GCM) with a key derived from the link's
// secret, so the Room can't read it, change it, replay it or reflect it back.
import { type Bytes, fromBase64url, toBase64url, utf8 } from "./bytes";
import type { Mode } from "./link";

export type Role = "owner" | "guest";

export type IntroMessage =
  | { t: "hello"; v: number; name: string; ua: string }
  | { t: "welcome"; v: number; name: string; ua: string; mode: Mode }
  | { t: "sdp"; type: "offer" | "answer"; sdp: string }
  | { t: "ice"; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }
  | { t: "bye" };

export type OpenResult =
  | { ok: true; message: IntroMessage }
  | { ok: false; reason: "tampered" | "replayed" | "after-bye" | "invalid" };

export interface Seal {
  seal(message: IntroMessage): Promise<string>;
  open(frame: string): Promise<OpenResult>;
}

export const MAX_FRAME_BYTES = 32 * 1024;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const TAMPERED: OpenResult = { ok: false, reason: "tampered" };

export async function createSeal(secret: Bytes, roomId: string, role: Role): Promise<Seal> {
  const key = await deriveSealKey(secret);
  const peer: Role = role === "owner" ? "guest" : "owner";
  // room_id and the role have fixed lengths (32 and 5 characters), so this is unambiguous.
  const aad = (r: Role, n: number) => utf8(`${roomId}${r}${n}`);
  const inOrder = queue();
  let sent = 0;
  let sentBye = false;
  let received = 0;
  let peerSaidBye = false;

  return {
    seal: (message) =>
      inOrder(async () => {
        if (sentBye) throw new Error("Nothing can be sent after bye");
        const n = ++sent;
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad(role, n) },
          key,
          utf8(JSON.stringify(message)),
        );
        const frame = JSON.stringify({
          r: role,
          n,
          iv: toBase64url(iv),
          ct: toBase64url(new Uint8Array(ct)),
        });
        if (frame.length > MAX_FRAME_BYTES) throw new RangeError("Frame over 32 KiB");
        sentBye = message.t === "bye";
        return frame;
      }),

    open: (frame) =>
      inOrder(async () => {
        const parsed = parseFrame(frame);
        if (!parsed || parsed.r !== peer) return TAMPERED; // includes our own frames reflected back
        if (peerSaidBye) return { ok: false, reason: "after-bye" };
        if (parsed.n <= received) return { ok: false, reason: "replayed" };
        let plain: ArrayBuffer;
        try {
          plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: parsed.iv, additionalData: aad(peer, parsed.n) },
            key,
            parsed.ct,
          );
        } catch {
          return TAMPERED;
        }
        received = parsed.n;
        const message = parseMessage(plain);
        if (!message) return { ok: false, reason: "invalid" };
        if (message.t === "bye") peerSaidBye = true;
        return { ok: true, message };
      }),
  };
}

/** k_seal = HKDF-SHA-256(secret, salt "handit/v1", info "seal"), a non-extractable AES-GCM key. */
async function deriveSealKey(secret: Bytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8("handit/v1"), info: utf8("seal") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/** The outer frame: exactly {r, n, iv, ct}, with a 12-byte IV and room for the 16-byte tag. */
function parseFrame(frame: string) {
  if (frame.length > MAX_FRAME_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    return null;
  }
  if (!isRecord(value) || Object.keys(value).sort().join() !== "ct,iv,n,r") return null;
  const { r, n, iv, ct } = value;
  if ((r !== "owner" && r !== "guest") || !isInt(n) || n < 1) return null;
  const ivBytes = isText(iv) ? fromBase64url(iv) : null;
  const ctBytes = isText(ct) ? fromBase64url(ct) : null;
  if (ivBytes?.length !== IV_BYTES || !ctBytes || ctBytes.length < TAG_BYTES) return null;
  return { r: r as Role, n, iv: ivBytes, ct: ctBytes };
}

/** The sealed message. Builds a fresh object from known fields only; anything else is dropped. */
function parseMessage(plain: ArrayBuffer): IntroMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    return null;
  }
  if (!isRecord(m)) return null;
  switch (m.t) {
    case "hello":
      return isInt(m.v) && isText(m.name) && isText(m.ua)
        ? { t: "hello", v: m.v, name: m.name, ua: m.ua }
        : null;
    case "welcome":
      return isInt(m.v) && isText(m.name) && isText(m.ua) && (m.mode === 1 || m.mode === 2)
        ? { t: "welcome", v: m.v, name: m.name, ua: m.ua, mode: m.mode }
        : null;
    case "sdp":
      return (m.type === "offer" || m.type === "answer") && isText(m.sdp)
        ? { t: "sdp", type: m.type, sdp: m.sdp }
        : null;
    case "ice":
      return isText(m.candidate) &&
        (m.sdpMid === null || isText(m.sdpMid)) &&
        (m.sdpMLineIndex === null || (isInt(m.sdpMLineIndex) && m.sdpMLineIndex >= 0))
        ? { t: "ice", candidate: m.candidate, sdpMid: m.sdpMid, sdpMLineIndex: m.sdpMLineIndex }
        : null;
    case "bye":
      return { t: "bye" };
    default:
      return null;
  }
}

/** Runs tasks one at a time in call order, so frames are numbered and checked in sequence. */
function queue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}
