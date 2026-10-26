import { afterEach, describe, expect, test, vi } from "vitest";
import { CHUNK_BYTES, MAX_ITEMS, type OfferItem } from "../src/core/protocol";
import { Receiver, Sender, type TransferState } from "../src/core/transfer";
import { MemoryChannel, MemorySink, MemorySource } from "./channel";

const MiB = 1024 * 1024;
const bytes = (n: number, seed = 1) => {
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = (i * 31 + seed) & 0xff;
  return data;
};

function setUp(sizes: number[], options: { unreadable?: number[]; delayMs?: number } = {}) {
  const files: Record<number, Uint8Array> = {};
  const items: OfferItem[] = sizes.map((size, i) => {
    files[i] = bytes(size, i);
    return { i, path: `Holiday/IMG_${i}.HEIC`, size, kind: "file", type: "image/heic" };
  });
  items.push({ i: items.length, path: "Holiday/empty folder", size: 0, kind: "dir", type: "" });
  const [a, b] = MemoryChannel.pair(options.delayMs);
  const sink = new MemorySink();
  const sender = new Sender(a, items, new MemorySource(files, new Set(options.unreadable)));
  const receiver = new Receiver(b, sink);
  return { files, items, a, b, sink, sender, receiver };
}

/** Accepts as soon as the recipient has the file list. */
const autoAccept = (receiver: Receiver) => {
  receiver.onchange = (s: TransferState) => {
    if (s.phase === "deciding") receiver.accept();
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("a complete transfer", () => {
  test("every file arrives identical and is verified on both sides", async () => {
    const { files, a, sink, sender, receiver } = setUp([0, 1000, 3.5 * MiB]);
    autoAccept(receiver);
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);

    expect(received.phase).toBe("complete");
    expect(sent.phase).toBe("complete");
    for (const i of [0, 1, 2]) expect(sink.files.get(i)).toEqual(files[i]);
    expect(sent.outcomes).toEqual({ 0: { ok: true }, 1: { ok: true }, 2: { ok: true } });
    expect(received.outcomes).toEqual(sent.outcomes);
    expect(received.items.map((x) => x.path)).toContain("Holiday/empty folder");
    expect(sent.bytes).toBe(sent.totalBytes);
    expect(received.bytes).toBe(3.5 * MiB + 1000);
    expect(Math.max(...a.binaryChunks)).toBeLessThanOrEqual(CHUNK_BYTES);
  });

  test("the sender pauses above 4 MiB buffered and resumes below 1 MiB", async () => {
    const { a, sender, receiver } = setUp([12 * MiB], { delayMs: 1 });
    autoAccept(receiver);
    await Promise.all([sender.run(), receiver.run()]);
    expect(a.bufferedAmountLowThreshold).toBe(MiB);
    expect(a.maxBuffered).toBeLessThanOrEqual(4 * MiB + CHUNK_BYTES);
  });

  test("more than 10,000 items is LIMIT_EXCEEDED before anything is sent", async () => {
    const [a] = MemoryChannel.pair();
    const items = Array.from(
      { length: MAX_ITEMS + 1 },
      (_, i): OfferItem => ({
        i,
        path: `f${i}`,
        size: 0,
        kind: "file",
        type: "",
      }),
    );
    const state = await new Sender(a, items, new MemorySource({})).run();
    expect(state.error?.code).toBe("LIMIT_EXCEEDED");
    expect(a.controls).toEqual([]);
  });
});

describe("the recipient decides", () => {
  test("declining tells the sender OFFER_DECLINED", async () => {
    const { sink, sender, receiver } = setUp([1000]);
    receiver.onchange = (s) => {
      if (s.phase === "deciding") receiver.decline();
    };
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(sent.error?.code).toBe("OFFER_DECLINED");
    expect(received.error?.code).toBe("OFFER_DECLINED");
    expect(sink.files.size).toBe(0);
  });

  test("no decision within 120 s is OFFER_TIMEOUT on both sides", async () => {
    vi.useFakeTimers();
    const { sender, receiver } = setUp([1000]);
    const runs = Promise.all([sender.run(), receiver.run()]);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(receiver.state.phase).toBe("deciding");
    await vi.advanceTimersByTimeAsync(2_000);
    const [sent, received] = await runs;
    expect(sent.error?.code).toBe("OFFER_TIMEOUT");
    expect(received.error?.code).toBe("OFFER_TIMEOUT");
  });

  test("pings keep a quiet connection alive while the recipient decides", async () => {
    vi.useFakeTimers();
    const { a, sender, receiver } = setUp([1000]);
    const runs = Promise.all([sender.run(), receiver.run()]);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(a.controls.some((c) => c.includes('"ping"'))).toBe(true);
    expect(receiver.state.phase).toBe("deciding");
    receiver.accept();
    let settled = false;
    void runs.then(() => {
      settled = true;
    });
    while (!settled) await vi.advanceTimersByTimeAsync(10);
    expect((await runs)[1].phase).toBe("complete");
  });
});

describe("verification", () => {
  test("a file corrupted once is detected, deleted and sent again", async () => {
    const { files, a, sink, sender, receiver } = setUp([2 * MiB]);
    let corrupted = false;
    a.tamper = (data) => {
      if (corrupted) return data;
      corrupted = true;
      const changed = data.slice();
      changed[10] = (changed[10] ?? 0) ^ 0xff;
      return changed;
    };
    autoAccept(receiver);
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(sink.discarded).toEqual([0]);
    expect(sink.files.get(0)).toEqual(files[0]);
    expect(sent.outcomes[0]).toEqual({ ok: true });
    expect(received.phase).toBe("complete");
  });

  test("a file corrupted twice is INTEGRITY_FAILED; the others still arrive", async () => {
    const { a, sink, sender, receiver } = setUp([MiB, 1000]);
    let current = -1;
    a.tamper = (data) => (current === 0 ? data.map((x) => x ^ 1) : data);
    const send = a.send.bind(a);
    a.send = (data) => {
      if (typeof data === "string" && data.includes('"file_start"')) current = JSON.parse(data).i;
      send(data);
    };
    autoAccept(receiver);
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(sent.outcomes).toEqual({ 0: { ok: false, code: "INTEGRITY_FAILED" }, 1: { ok: true } });
    expect(received.outcomes).toEqual(sent.outcomes);
    expect(sink.files.has(0)).toBe(false);
    expect(sink.discarded).toEqual([0, 0]);
  });

  test("a file the browser can't read is SOURCE_UNREADABLE and skipped", async () => {
    const { files, sink, sender, receiver } = setUp([3 * MiB, 1000], { unreadable: [0] });
    autoAccept(receiver);
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(sent.outcomes).toEqual({ 0: { ok: false, code: "SOURCE_UNREADABLE" }, 1: { ok: true } });
    expect(received.outcomes).toEqual(sent.outcomes);
    expect(sink.files.get(1)).toEqual(files[1]);
    expect(sink.discarded).toContain(0);
  });
});

describe("cancel and failures", () => {
  const midTransfer = (receiver: Receiver, action: () => void) => {
    let acted = false;
    receiver.onchange = (s) => {
      if (s.phase === "deciding") receiver.accept();
      if (s.phase === "transferring" && s.bytes > 0 && !acted) {
        acted = true;
        action();
      }
    };
  };

  test("the sender cancelling mid-transfer: CANCELLED_BY_PEER, partial file removed", async () => {
    const { sink, sender, receiver } = setUp([8 * MiB], { delayMs: 1 });
    midTransfer(receiver, () => sender.cancel());
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(sent.error?.code).toBe("CANCELLED_BY_USER");
    expect(received.error?.code).toBe("CANCELLED_BY_PEER");
    expect(sink.discarded).toEqual([0]);
  });

  test("the recipient cancelling mid-transfer", async () => {
    const { sink, sender, receiver } = setUp([8 * MiB], { delayMs: 1 });
    midTransfer(receiver, () => receiver.cancel());
    const [sent, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(received.error?.code).toBe("CANCELLED_BY_USER");
    expect(sent.error?.code).toBe("CANCELLED_BY_PEER");
    expect(sink.discarded).toEqual([0]);
  });

  test("the other tab closing mid-transfer is PEER_LEFT; finished files stay", async () => {
    const { files, a, sink, sender, receiver } = setUp([1000, 8 * MiB], { delayMs: 1 });
    let closed = false;
    receiver.onchange = (s) => {
      if (s.phase === "deciding") receiver.accept();
      if (s.filesDone === 1 && s.bytes > 1000 && !closed) {
        closed = true;
        a.close();
      }
    };
    const [, received] = await Promise.all([sender.run(), receiver.run()]);
    expect(received.error?.code).toBe("PEER_LEFT");
    expect(sink.files.get(0)).toEqual(files[0]);
    expect(sink.discarded).toEqual([1]);
  });

  test("45 s without any traffic is CONNECTION_LOST", async () => {
    vi.useFakeTimers();
    const { a, b, sender, receiver } = setUp([1000]);
    const runs = Promise.all([sender.run(), receiver.run()]);
    await vi.advanceTimersByTimeAsync(1_000);
    a.silent = true;
    b.silent = true;
    await vi.advanceTimersByTimeAsync(46_000);
    const [sent, received] = await runs;
    expect(sent.error?.code).toBe("CONNECTION_LOST");
    expect(received.error?.code).toBe("CONNECTION_LOST");
  });

  test("a malformed message ends the transfer with UNKNOWN_ERROR (protocol error)", async () => {
    const { a, receiver } = setUp([1000]);
    const run = receiver.run();
    a.send('{"t":"file_start","i":0}'); // before any offer
    const state = await run;
    expect(state.error?.code).toBe("UNKNOWN_ERROR");
    expect(state.error?.details).toContain("protocol error");
  });

  test("more bytes than the file list declared is a protocol error", async () => {
    const { a, receiver } = setUp([10]);
    const sendRaw = (m: object) => a.send(JSON.stringify(m));
    receiver.onchange = (s) => {
      if (s.phase === "deciding") {
        receiver.accept();
        sendRaw({ t: "file_start", i: 0 });
        a.send(new Uint8Array(11));
      }
    };
    const id = "0123456789abcdef0123456789abcdef";
    sendRaw({ t: "offer", id, files: 1, bytes: 10, parts: 1 });
    sendRaw({
      t: "offer_items",
      id,
      items: [{ i: 0, path: "a", size: 10, kind: "file", type: "" }],
    });
    const state = await receiver.run();
    expect(state.error?.details).toContain("protocol error");
  });

  test("a binary message larger than a chunk is a protocol error before it is processed", async () => {
    const { a, receiver } = setUp([10 * MiB]);
    const sendRaw = (m: object) => a.send(JSON.stringify(m));
    receiver.onchange = (s) => {
      if (s.phase === "deciding") {
        receiver.accept();
        sendRaw({ t: "file_start", i: 0 });
        a.send(new Uint8Array(CHUNK_BYTES + 1)); // within the declared size, but not a valid chunk
      }
    };
    const id = "0123456789abcdef0123456789abcdef";
    sendRaw({ t: "offer", id, files: 1, bytes: 10 * MiB, parts: 1 });
    sendRaw({
      t: "offer_items",
      id,
      items: [{ i: 0, path: "a", size: 10 * MiB, kind: "file", type: "" }],
    });
    const state = await receiver.run();
    expect(state.error?.details).toContain("protocol error");
    expect(state.bytes).toBe(0);
  });

  test("a message of exactly one chunk is fine", async () => {
    const { files, sink, sender, receiver } = setUp([3 * CHUNK_BYTES]);
    autoAccept(receiver);
    await Promise.all([sender.run(), receiver.run()]);
    expect(sink.files.get(0)).toEqual(files[0]);
  });

  test("a text message over 64 KiB is a protocol error", async () => {
    const { a, receiver } = setUp([1000]);
    const run = receiver.run();
    a.send(`{"t":"ping","pad":"${"x".repeat(64 * 1024)}"}`);
    const state = await run;
    expect(state.error?.details).toContain("protocol error");
  });
});
