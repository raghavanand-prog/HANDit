// In-memory stand-ins for an RTCDataChannel pair, a file source and a receiving sink,
// so the transfer engine can be tested without browsers.
import type { HanditError } from "../src/core/codes";
import { BLOCK_BYTES, BlockHasher } from "../src/core/hash";
import type { BlockReader, ChannelLike, Sink, Source } from "../src/core/transfer";

export class MemoryChannel extends EventTarget implements ChannelLike {
  peer?: MemoryChannel;
  readyState: RTCDataChannelState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  maxBuffered = 0;
  binaryChunks: number[] = [];
  controls: string[] = [];
  /** Change binary data in flight (simulates corruption). */
  tamper?: (data: Uint8Array) => Uint8Array;
  /** Stop delivering anything (simulates a dead network). */
  silent = false;

  constructor(private delayMs = 0) {
    super();
  }

  static pair(delayMs = 0): [MemoryChannel, MemoryChannel] {
    const a = new MemoryChannel(delayMs);
    const b = new MemoryChannel(delayMs);
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  send(data: string | ArrayBuffer | ArrayBufferView<ArrayBuffer>) {
    if (this.readyState !== "open") throw new Error("Channel closed");
    let payload: string | Uint8Array;
    if (typeof data === "string") {
      payload = data;
      this.controls.push(data);
    } else {
      const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data);
      payload = new Uint8Array(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
      );
      if (this.tamper) payload = this.tamper(payload);
      this.binaryChunks.push(payload.byteLength);
    }
    const size = typeof payload === "string" ? payload.length : payload.byteLength;
    this.bufferedAmount += size;
    this.maxBuffered = Math.max(this.maxBuffered, this.bufferedAmount);
    setTimeout(() => {
      const before = this.bufferedAmount;
      this.bufferedAmount -= size;
      if (
        before > this.bufferedAmountLowThreshold &&
        this.bufferedAmount <= this.bufferedAmountLowThreshold
      ) {
        this.dispatchEvent(new Event("bufferedamountlow"));
      }
      const peer = this.peer;
      if (this.silent || !peer || peer.readyState !== "open") return;
      const delivered = typeof payload === "string" ? payload : payload.slice().buffer;
      peer.dispatchEvent(Object.assign(new Event("message"), { data: delivered }));
    }, this.delayMs);
  }

  close() {
    for (const side of [this, this.peer]) {
      if (!side || side.readyState === "closed") continue;
      side.readyState = "closed";
      setTimeout(() => side.dispatchEvent(new Event("close")), 0);
    }
  }
}

/** Reads in-memory files in 1 MiB blocks, hashing exactly what it returns. */
export class MemorySource implements Source {
  constructor(
    private files: Record<number, Uint8Array>,
    private unreadable = new Set<number>(),
  ) {}

  open(i: number): BlockReader {
    const data = this.files[i] ?? new Uint8Array();
    const hasher = new BlockHasher();
    let offset = 0;
    return {
      next: async () => {
        if (this.unreadable.has(i) && offset > 0) throw new Error("NotReadableError");
        if (offset >= data.length) return null;
        const block = data.slice(offset, offset + BLOCK_BYTES);
        offset += block.length;
        await hasher.update(block);
        return block;
      },
      root: () => hasher.root(),
    };
  }
}

/** Collects received files in memory. */
export class MemorySink implements Sink {
  onfail?: (error: HanditError) => void;
  files = new Map<number, Uint8Array>();
  discarded: number[] = [];
  private current?: { i: number; parts: Uint8Array[]; hasher: BlockHasher; writes: Promise<void> };

  async begin(_transferId: string, i: number) {
    this.current = { i, parts: [], hasher: new BlockHasher(), writes: Promise.resolve() };
  }

  write(data: ArrayBuffer) {
    const current = this.current;
    if (!current) throw new Error("write without begin");
    const bytes = new Uint8Array(data);
    current.parts.push(bytes);
    current.writes = current.writes.then(() => current.hasher.update(bytes));
  }

  async end() {
    const current = this.current;
    if (!current) throw new Error("end without begin");
    await current.writes;
    const size = current.parts.reduce((s, p) => s + p.length, 0);
    const joined = new Uint8Array(size);
    let o = 0;
    for (const p of current.parts) {
      joined.set(p, o);
      o += p.length;
    }
    this.files.set(current.i, joined);
    this.current = undefined;
    return { size, root: await current.hasher.root() };
  }

  async discard(_transferId: string, i: number) {
    this.files.delete(i);
    this.discarded.push(i);
    if (this.current?.i === i) this.current = undefined;
  }
}
