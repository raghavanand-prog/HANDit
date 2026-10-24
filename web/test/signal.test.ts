import { describe, expect, test } from "vitest";
import type { HanditError } from "../src/core/codes";
import { createSeal, type IntroMessage } from "../src/core/seal";
import { openSignal, roomUrl, type SocketLike } from "../src/core/signal";
import { ROOM_ID, SECRET } from "./helpers";

// A stand-in for the browser's WebSocket that the test drives by hand.
class FakeSocket extends EventTarget implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  constructor(readonly url: string) {
    super();
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.closedWith = code;
    this.serverClose(code, "");
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  receive(data: string) {
    this.dispatchEvent(Object.assign(new Event("message"), { data }));
  }
  serverClose(code: number, reason: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
  }
}

async function setUp() {
  const guestSeal = await createSeal(SECRET, ROOM_ID, "guest");
  const ownerSeal = await createSeal(SECRET, ROOM_ID, "owner");
  let socket: FakeSocket | undefined;
  const received: IntroMessage[] = [];
  const failures: HanditError[] = [];
  const signal = openSignal("wss://handit.test/ws/x?role=guest", guestSeal, (url) => {
    socket = new FakeSocket(url);
    return socket;
  });
  signal.onmessage = (m) => received.push(m);
  signal.onfail = (e) => failures.push(e);
  if (!socket) throw new Error("no socket");
  return { signal, socket, ownerSeal, received, failures };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const hello: IntroMessage = { t: "hello", v: 1, name: "Pixel", ua: "Chrome on Android" };
const welcome: IntroMessage = { t: "welcome", v: 1, name: "Mac", ua: "Safari on Mac", mode: 1 };

test("roomUrl builds the WebSocket address for each role", () => {
  expect(roomUrl("https://handit.example", ROOM_ID, "owner", 120)).toBe(
    `wss://handit.example/ws/${ROOM_ID}?role=owner&ttl=120`,
  );
  expect(roomUrl("http://localhost:8787", ROOM_ID, "guest")).toBe(
    `ws://localhost:8787/ws/${ROOM_ID}?role=guest`,
  );
});

describe("sending and receiving", () => {
  test("messages go out sealed and come in opened", async () => {
    const { signal, socket, ownerSeal, received } = await setUp();
    socket.open();
    await signal.ready;
    await signal.send(hello);
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).not.toContain("Pixel");
    expect(await ownerSeal.open(socket.sent[0] ?? "")).toEqual({ ok: true, message: hello });

    socket.receive(await ownerSeal.seal(welcome));
    await flush();
    expect(received).toEqual([welcome]);
  });

  test("a replayed frame is dropped quietly", async () => {
    const { socket, ownerSeal, received, failures } = await setUp();
    socket.open();
    const frame = await ownerSeal.seal(welcome);
    socket.receive(frame);
    socket.receive(frame);
    await flush();
    expect(received).toHaveLength(1);
    expect(failures).toEqual([]);
  });

  test("a tampered frame ends the session with INTRO_TAMPERED", async () => {
    const { socket, ownerSeal, received, failures } = await setUp();
    socket.open();
    const frame = JSON.parse(await ownerSeal.seal(welcome)) as { ct: string };
    frame.ct = `B${frame.ct.slice(1)}`;
    socket.receive(JSON.stringify(frame));
    await flush();
    expect(received).toEqual([]);
    expect(failures.map((f) => f.code)).toEqual(["INTRO_TAMPERED"]);
    expect(socket.closedWith).toBe(1000);
  });
});

describe("close codes", () => {
  test.each([
    [4404, "CODE_NOT_ACTIVE"],
    [4409, "CODE_ALREADY_USED"],
    [4410, "CODE_EXPIRED"],
    [4429, "UNKNOWN_ERROR"],
    [1000, "PEER_LEFT"],
    [1006, "SERVER_UNREACHABLE"],
  ])("close code %i after opening is %s", async (code, expected) => {
    const { socket, failures } = await setUp();
    socket.open();
    socket.serverClose(code, "Too many attempts");
    expect(failures.map((f) => f.code)).toEqual([expected]);
  });

  test("the reason travels in Details", async () => {
    const { socket, failures } = await setUp();
    socket.open();
    socket.serverClose(4429, "Too many attempts");
    expect(failures[0]?.details).toContain("Too many attempts");
  });

  test("failing to connect at all is SERVER_UNREACHABLE", async () => {
    const { signal, socket, failures } = await setUp();
    socket.serverClose(1006, "");
    await expect(signal.ready).rejects.toMatchObject({ code: "SERVER_UNREACHABLE" });
    expect(failures.map((f) => f.code)).toEqual(["SERVER_UNREACHABLE"]);
  });

  test("closing it ourselves is not a failure", async () => {
    const { signal, socket, failures } = await setUp();
    socket.open();
    signal.close();
    expect(socket.closedWith).toBe(1000);
    expect(failures).toEqual([]);
  });
});
