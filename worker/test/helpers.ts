import { exports } from "cloudflare:workers";

const randomByte = () => crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;

/** A fresh room ID and client IP per test, so tests never share a Room or a counter. */
export const newRoomId = () => crypto.randomUUID().replaceAll("-", "");
export const newIp = () => `10.${randomByte()}.${randomByte()}.${randomByte()}`;

export interface Client {
  send(data: string | ArrayBuffer): void;
  receive(): Promise<string>;
  closed: Promise<{ code: number; reason: string }>;
  isOpen(): Promise<boolean>;
  close(): void;
}

/** Opens a WebSocket to /ws/<roomId>?<query> through the Worker, as a browser would. */
export async function connect(roomId: string, query: string, ip = newIp()): Promise<Client> {
  const response = await exports.default.fetch(`https://handit.test/ws/${roomId}?${query}`, {
    headers: { Upgrade: "websocket", "CF-Connecting-IP": ip },
  });
  const ws = response.webSocket;
  if (!ws) throw new Error(`Expected a WebSocket, got HTTP ${response.status}`);
  ws.accept();

  const inbox: string[] = [];
  const waiting: ((message: string) => void)[] = [];
  ws.addEventListener("message", (event) => {
    const message = event.data as string;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else inbox.push(message);
  });
  let open = true;
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.addEventListener("close", (event) => {
      open = false;
      resolve({ code: event.code, reason: event.reason });
    }),
  );

  return {
    send: (data) => ws.send(data),
    receive: () => {
      const message = inbox.shift();
      return message !== undefined
        ? Promise.resolve(message)
        : new Promise((resolve) => waiting.push(resolve));
    },
    closed,
    // A refused connection is closed straight away; give it a moment to arrive.
    isOpen: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return open;
    },
    close: () => ws.close(1000),
  };
}

/** An owner (code lifetime 120 s) and a guest, both connected to the same Room. */
export async function pair(roomId = newRoomId()) {
  const owner = await connect(roomId, "role=owner&ttl=120");
  const guest = await connect(roomId, "role=guest");
  return { roomId, owner, guest };
}
