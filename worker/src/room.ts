import { DurableObject } from "cloudflare:workers";

// One Room per code. It introduces the two browsers by passing sealed frames
// between them unchanged; it can't read them and never looks inside.
// Rules: owner first, one guest ever, short life, forward only, no records.

type Role = "owner" | "guest";
type Join = { role: "owner"; ttl: number } | { role: "guest" };
type Meta = { expiresAt: number; guestJoined: boolean };

export const MAX_FRAME_BYTES = 32 * 1024;
export const MAX_FRAMES = 100;
const MAX_LIFE_MS = 10 * 60 * 1000;
const TTLS = ["60", "120", "300"];

/** WebSocket close codes. 4404, 4409 and 4410 map to the message codes the browser shows. */
export const Close = {
  BINARY_FRAME: 4400,
  NOT_ACTIVE: 4404,
  ROOM_TIMED_OUT: 4408,
  ALREADY_USED: 4409,
  EXPIRED: 4410,
  FRAME_TOO_LARGE: 4413,
  TOO_MANY: 4429,
} as const;

/** ?role=owner&ttl=60|120|300 or ?role=guest. Anything else is null. */
export function parseJoin(url: URL): Join | null {
  const role = url.searchParams.get("role");
  const ttl = url.searchParams.get("ttl") ?? "";
  if (role === "owner" && TTLS.includes(ttl)) return { role, ttl: Number(ttl) };
  if (role === "guest") return { role };
  return null;
}

/** Accepts the WebSocket only to close it straight away: browsers can read a close code, not an HTTP status. */
export function refuse(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

export class Room extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const join = parseJoin(new URL(request.url));
    if (!join) return new Response("Bad request", { status: 400 });
    const meta = this.ctx.storage.kv.get<Meta>("meta");
    const now = Date.now();

    if (join.role === "owner") {
      if (meta) return refuse(Close.ALREADY_USED, "CODE_ALREADY_USED");
      this.ctx.storage.kv.put<Meta>("meta", {
        expiresAt: now + join.ttl * 1000,
        guestJoined: false,
      });
      await this.ctx.storage.setAlarm(now + MAX_LIFE_MS);
      return this.accept("owner");
    }

    if (!meta || this.ctx.getWebSockets("owner").length === 0) {
      return refuse(Close.NOT_ACTIVE, "CODE_NOT_ACTIVE");
    }
    if (meta.guestJoined) return refuse(Close.ALREADY_USED, "CODE_ALREADY_USED");
    if (now >= meta.expiresAt) return refuse(Close.EXPIRED, "CODE_EXPIRED");
    this.ctx.storage.kv.put<Meta>("meta", { ...meta, guestJoined: true });
    return this.accept("guest");
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return this.end(Close.BINARY_FRAME, "Text frames only");
    // A string is never shorter in bytes than in characters, so a long one is refused without
    // encoding it; a short one still gets the exact byte count (multi-byte characters).
    if (
      message.length > MAX_FRAME_BYTES ||
      new TextEncoder().encode(message).length > MAX_FRAME_BYTES
    ) {
      return this.end(Close.FRAME_TOO_LARGE, "Frame over 32 KiB");
    }
    if (this.countFrame(ws) > MAX_FRAMES) return this.end(Close.TOO_MANY, "Too many frames");

    const other = this.ctx.getTags(ws)[0] === "owner" ? "guest" : "owner";
    for (const peer of this.ctx.getWebSockets(other)) {
      try {
        peer.send(message);
      } catch {
        // The other side already left (both can close at about the same time).
      }
    }
  }

  // Either side leaving ends the introduction: before a guest joins, that cancels
  // the code; afterwards the two browsers are either connected or have failed.
  override async webSocketClose(): Promise<void> {
    await this.end(1000, "Peer left");
  }

  override async webSocketError(): Promise<void> {
    await this.end(1000, "Peer left");
  }

  // At most 10 minutes after creation.
  override async alarm(): Promise<void> {
    await this.end(Close.ROOM_TIMED_OUT, "Room timed out");
  }

  private accept(role: Role): Response {
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    // The Hibernation API: the Room can sleep between frames without dropping the sockets.
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ frames: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Counts a frame on its socket (this survives hibernation) and returns the Room's total. */
  private countFrame(ws: WebSocket): number {
    const { frames } = ws.deserializeAttachment() as { frames: number };
    ws.serializeAttachment({ frames: frames + 1 });
    return this.ctx
      .getWebSockets()
      .reduce((sum, s) => sum + (s.deserializeAttachment() as { frames: number }).frames, 0);
  }

  /** Closes both sockets and deletes everything the Room knew. Closing fires this once per socket; only the first does the work. */
  private async end(code: number, reason: string): Promise<void> {
    if (this.ctx.storage.kv.get("meta") === undefined) return;
    this.ctx.storage.kv.delete("meta"); // synchronous: a second call can't slip in before the wipe
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(code, reason);
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
