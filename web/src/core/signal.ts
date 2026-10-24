// The WebSocket client for the Room. Everything sent is sealed and everything
// received is opened (see seal.ts); the Room only ever sees ciphertext.
import { type ErrorCode, HanditError } from "./codes";
import type { IntroMessage, Role, Seal } from "./seal";

/** The parts of a browser WebSocket this module uses (a test can provide its own). */
export interface SocketLike extends EventTarget {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number): void;
}

export interface Signal {
  /** Resolves once connected to the Room; rejects if the Room can't be reached. */
  ready: Promise<void>;
  /** Called for each authentic message from the other device. */
  onmessage: (message: IntroMessage) => void;
  /** Called once if the session through the Room fails. */
  onfail: (error: HanditError) => void;
  send(message: IntroMessage): Promise<void>;
  /** Leaves the Room. Not reported as a failure. */
  close(): void;
}

// The Room's close codes for refused or ended connections.
const CLOSE_CODES: Record<number, ErrorCode> = {
  4404: "CODE_NOT_ACTIVE",
  4409: "CODE_ALREADY_USED",
  4410: "CODE_EXPIRED",
  1000: "PEER_LEFT",
};

export function roomUrl(origin: string, roomId: string, role: Role, ttl?: number): string {
  const url = new URL(`/ws/${roomId}`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = role === "owner" ? `role=owner&ttl=${ttl}` : "role=guest";
  return url.href;
}

export function openSignal(
  url: string,
  seal: Seal,
  makeSocket: (url: string) => SocketLike = (u) => new WebSocket(u),
): Signal {
  const socket = makeSocket(url);
  let opened = false;
  let finished = false;
  let resolveReady: () => void = () => {};
  let rejectReady: (error: HanditError) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {}); // reported through onfail as well

  const signal: Signal = {
    ready,
    onmessage: () => {},
    onfail: () => {},
    async send(message) {
      const frame = await seal.seal(message);
      if (socket.readyState === 1) socket.send(frame);
    },
    close() {
      finished = true;
      socket.close(1000);
    },
  };

  const fail = (error: HanditError) => {
    if (finished) return;
    finished = true;
    rejectReady(error);
    signal.onfail(error);
    socket.close(1000);
  };

  socket.addEventListener("open", () => {
    opened = true;
    resolveReady();
  });
  socket.addEventListener("message", (event) => {
    const data = (event as MessageEvent).data;
    if (typeof data !== "string") return;
    void seal.open(data).then((result) => {
      if (finished) return;
      if (result.ok) signal.onmessage(result.message);
      else if (result.reason === "tampered") fail(new HanditError("INTRO_TAMPERED"));
      else if (result.reason === "invalid")
        fail(new HanditError("UNKNOWN_ERROR", "protocol error"));
      // Replays and frames after bye are dropped: they were already handled or are too late.
    });
  });
  socket.addEventListener("close", (event) => {
    const { code, reason } = event as CloseEvent;
    const details = `Room closed the connection (${code}${reason ? `: ${reason}` : ""})`;
    const mapped = opened ? (CLOSE_CODES[code] ?? (code >= 4000 ? "UNKNOWN_ERROR" : null)) : null;
    fail(new HanditError(mapped ?? "SERVER_UNREACHABLE", details));
  });
  return signal;
}
