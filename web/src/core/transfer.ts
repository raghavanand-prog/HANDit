// The transfer engine: sends an offer, waits for the recipient's decision, then
// sends files in 64 KiB chunks with flow control. Every file is verified: the
// recipient compares the size and root of exactly the bytes it wrote with the
// sender's, keeps the file only if both match, and the sender retries a failed
// file once. Runs over any RTCDataChannel-like object, so it's testable in memory.
import { type ErrorCode, HanditError, toHanditError } from "./codes";
import { makeSafe } from "./names";
import {
  CHUNK_BYTES,
  type Control,
  type FileFailCode,
  MAX_ITEMS,
  OfferAssembler,
  type OfferItem,
  parseControl,
  splitOffer,
} from "./protocol";

export const DECISION_TIMEOUT_MS = 120_000;
export const IDLE_PING_MS = 15_000;
export const IDLE_LOST_MS = 45_000;
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1024 * 1024;
const TICK_MS = 5_000;
const MAX_ATTEMPTS = 2;

/** The parts of RTCDataChannel the engine uses. */
export interface ChannelLike extends EventTarget {
  readonly readyState: RTCDataChannelState;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  send(data: string | ArrayBuffer | ArrayBufferView<ArrayBuffer>): void;
  close(): void;
}

/** Reads one file in 1 MiB blocks, hashing exactly the bytes it returns. */
export interface BlockReader {
  next(): Promise<Uint8Array<ArrayBuffer> | Uint8Array | null>;
  root(): Promise<string>;
}
export interface Source {
  open(i: number): BlockReader;
}

/** Stores and hashes received files, one at a time. */
export interface Sink {
  onfail?: (error: HanditError) => void;
  begin(transferId: string, i: number): Promise<void>;
  write(data: ArrayBuffer): void;
  end(): Promise<{ size: number; root: string }>;
  discard(transferId: string, i: number): Promise<void>;
}

export type FileOutcome = { ok: true } | { ok: false; code: FileFailCode };

export type Phase = "offering" | "deciding" | "transferring" | "complete" | "failed";

export interface TransferState {
  phase: Phase;
  /** The transfer ID (from the offer). */
  id: string;
  items: OfferItem[];
  bytes: number;
  totalBytes: number;
  filesDone: number;
  totalFiles: number;
  /** Final result per file index. */
  outcomes: Record<number, FileOutcome>;
  error?: HanditError;
}

const randomId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

const protocolError = (what: string) => new HanditError("UNKNOWN_ERROR", `protocol error: ${what}`);

/** Shared by both sides: the channel, keep-alive pings, failure and cancel. */
abstract class Transfer {
  state: TransferState;
  onchange: (state: TransferState) => void = () => {};
  protected finished = false;
  private lastIn = Date.now();
  private lastOut = Date.now();
  private ticker?: ReturnType<typeof setInterval>;
  private queue = Promise.resolve();
  private rejectFailure: (error: HanditError) => void = () => {};
  /** Rejects when the transfer fails; every wait races against it. */
  protected readonly failure = new Promise<never>((_, reject) => {
    this.rejectFailure = reject;
  });

  constructor(
    protected readonly channel: ChannelLike,
    items: OfferItem[] = [],
  ) {
    this.failure.catch(() => {});
    const files = items.filter((x) => x.kind === "file");
    this.state = {
      phase: "offering",
      id: "",
      items,
      bytes: 0,
      totalBytes: files.reduce((s, x) => s + x.size, 0),
      filesDone: 0,
      totalFiles: files.length,
      outcomes: {},
    };
  }

  /** Runs the transfer to the end. Always resolves; failures are in state.error. */
  async run(): Promise<TransferState> {
    this.channel.addEventListener("message", this.onMessage);
    this.channel.addEventListener("close", this.onClose);
    this.ticker = setInterval(this.tick, TICK_MS);
    try {
      await Promise.race([this.main(), this.failure]);
      this.update({ phase: "complete" });
    } catch (error) {
      this.fail(toHanditError(error));
    } finally {
      this.stop();
    }
    return this.state;
  }

  /** Cancels from this side; the other device is told. */
  cancel() {
    this.abort(new HanditError("CANCELLED_BY_USER"));
  }

  /** Ends the transfer with an error; the other device is told it was cancelled. */
  abort(error: HanditError) {
    this.fail(error, true);
  }

  protected abstract main(): Promise<void>;
  protected abstract handle(message: Control | ArrayBuffer): Promise<void> | void;
  protected cleanUp(): Promise<void> | void {}

  protected update(change: Partial<TransferState>) {
    this.state = { ...this.state, ...change };
    this.onchange(this.state);
  }

  protected send(message: Control) {
    if (this.channel.readyState !== "open") return;
    this.lastOut = Date.now();
    this.channel.send(JSON.stringify(message));
  }

  protected sendBytes(bytes: Uint8Array) {
    this.lastOut = Date.now();
    this.channel.send(bytes as Uint8Array<ArrayBuffer>);
  }

  /** Waits until the channel's send buffer has room (above 4 MiB: wait until below 1 MiB). */
  protected async room() {
    if (this.channel.bufferedAmount <= HIGH_WATER) return;
    await Promise.race([
      new Promise((resolve) =>
        this.channel.addEventListener("bufferedamountlow", resolve, { once: true }),
      ),
      this.failure,
    ]);
  }

  protected fail(error: HanditError, tellPeer = false) {
    if (this.finished) return;
    if (tellPeer) this.send({ t: "cancel" });
    this.finished = true;
    this.rejectFailure(error);
    this.update({ phase: "failed", error });
    void this.cleanUp();
  }

  private stop() {
    this.finished = true;
    clearInterval(this.ticker);
    this.channel.removeEventListener("message", this.onMessage);
    this.channel.removeEventListener("close", this.onClose);
  }

  private tick = () => {
    const now = Date.now();
    if (now - this.lastIn >= IDLE_LOST_MS) this.fail(new HanditError("CONNECTION_LOST"));
    else if (now - this.lastOut >= IDLE_PING_MS) this.send({ t: "ping" });
  };

  private onClose = () => this.fail(new HanditError("PEER_LEFT"));

  private onMessage = (event: Event) => {
    this.lastIn = Date.now();
    const data = (event as MessageEvent).data as string | ArrayBuffer;
    let message: Control | ArrayBuffer;
    if (typeof data === "string") {
      const control = parseControl(data);
      if (!control) return this.fail(protocolError("malformed message"), true);
      if (control.t === "ping") return this.send({ t: "pong" });
      if (control.t === "pong") return;
      if (control.t === "cancel") return this.fail(new HanditError("CANCELLED_BY_PEER"));
      message = control;
    } else {
      message = data;
    }
    // Handle messages strictly in order, one at a time.
    this.queue = this.queue
      .then(() => (this.finished ? undefined : this.handle(message)))
      .catch((error) => this.fail(toHanditError(error), true));
  };
}

export class Sender extends Transfer {
  private decision?: (message: Control) => void;
  private pending = 0;
  private resultsIn?: () => void;
  private attempts: Record<number, number> = {};
  private results: Record<number, FileOutcome> = {};
  private summary?: (message: Extract<Control, { t: "summary" }>) => void;

  constructor(
    channel: ChannelLike,
    private readonly items: OfferItem[],
    private readonly source: Source,
  ) {
    super(channel, items);
  }

  protected async main() {
    if (this.items.length > MAX_ITEMS) throw new HanditError("LIMIT_EXCEEDED");
    this.channel.bufferedAmountLowThreshold = LOW_WATER;
    const id = randomId();
    const parts = splitOffer(id, this.items);
    this.update({ id });
    this.send({
      t: "offer",
      id,
      files: this.state.totalFiles,
      bytes: this.state.totalBytes,
      parts: parts.length,
    });
    for (const part of parts) this.send(part);

    this.update({ phase: "deciding" });
    const decision = await this.wait<Control>((resolve) => {
      this.decision = resolve;
    }, DECISION_TIMEOUT_MS + 5_000);
    if (!decision) throw new HanditError("OFFER_TIMEOUT");
    if (decision.t === "decline") {
      throw new HanditError(decision.reason === "timeout" ? "OFFER_TIMEOUT" : "OFFER_DECLINED");
    }

    this.update({ phase: "transferring" });
    let queue = this.items.filter((x) => x.kind === "file").map((x) => x.i);
    while (queue.length > 0) {
      for (const i of queue) await this.sendFile(i);
      if (this.pending > 0) await this.wait<void>((resolve) => (this.resultsIn = resolve));
      queue = Object.entries(this.results)
        .filter(
          ([i, r]) =>
            !r.ok && r.code === "INTEGRITY_FAILED" && (this.attempts[+i] ?? 0) < MAX_ATTEMPTS,
        )
        .map(([i]) => +i);
      for (const i of queue) this.update({ totalBytes: this.state.totalBytes + this.size(i) });
    }

    this.send({ t: "done" });
    const summary = await this.wait<Extract<Control, { t: "summary" }>>((resolve) => {
      this.summary = resolve;
    });
    if (!summary) throw protocolError("no summary");
    const outcomes: Record<number, FileOutcome> = {};
    for (const i of summary.ok) outcomes[i] = { ok: true };
    for (const f of summary.failed) outcomes[f.i] = { ok: false, code: f.code };
    this.update({ outcomes });
  }

  protected handle(message: Control | ArrayBuffer) {
    if (message instanceof ArrayBuffer) throw protocolError("unexpected data");
    if ((message.t === "accept" || message.t === "decline") && this.decision) {
      if (message.id !== this.state.id) throw protocolError("wrong transfer id");
      this.decision(message);
      this.decision = undefined;
    } else if (message.t === "file_result" && this.state.phase === "transferring") {
      if (!(message.i in this.attempts)) throw protocolError("result for an unsent file");
      this.pending--;
      this.results[message.i] = message.ok ? { ok: true } : { ok: false, code: message.code };
      this.update({ filesDone: Object.values(this.results).filter((r) => r.ok).length });
      if (this.pending === 0) this.resultsIn?.();
    } else if (message.t === "summary" && this.summary) {
      this.summary(message);
    } else {
      throw protocolError(`unexpected ${message.t}`);
    }
  }

  private size(i: number) {
    return this.items[i]?.size ?? 0;
  }

  private async sendFile(i: number) {
    this.attempts[i] = (this.attempts[i] ?? 0) + 1;
    delete this.results[i];
    this.send({ t: "file_start", i });
    const reader = this.source.open(i);
    let size = 0;
    let root: string;
    try {
      for (let block = await reader.next(); block; block = await reader.next()) {
        size += block.length;
        if (size > this.size(i)) throw new Error("file grew since it was picked");
        for (let offset = 0; offset < block.length; offset += CHUNK_BYTES) {
          await this.room();
          if (this.finished) return;
          const chunk = block.subarray(offset, offset + CHUNK_BYTES);
          this.sendBytes(chunk);
          this.update({ bytes: this.state.bytes + chunk.length });
        }
      }
      if (size !== this.size(i)) throw new Error("file changed since it was picked");
      root = await reader.root();
    } catch (error) {
      if (this.finished) throw error;
      this.send({ t: "file_abort", i, code: "SOURCE_UNREADABLE" });
      this.results[i] = { ok: false, code: "SOURCE_UNREADABLE" };
      return;
    }
    this.pending++;
    this.send({ t: "file_end", i, size, root });
  }

  /** Waits for a reply (or a timeout, which resolves undefined), unless the transfer fails first. */
  private wait<T>(register: (resolve: (value: T) => void) => void, timeoutMs?: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      new Promise<T | undefined>((resolve) => {
        register(resolve);
        if (timeoutMs) timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
      this.failure,
    ]).finally(() => clearTimeout(timer));
  }
}

export class Receiver extends Transfer {
  private assembler?: OfferAssembler;
  private decisionTimer?: ReturnType<typeof setTimeout>;
  private accepted: () => void = () => {};
  private readonly acceptance = new Promise<void>((resolve) => (this.accepted = resolve));
  private current?: { i: number; received: number };
  private attempts: Record<number, number> = {};
  private finishedFiles = new Set<number>();
  private allDone: () => void = () => {};
  private readonly done = new Promise<void>((resolve) => (this.allDone = resolve));

  constructor(
    channel: ChannelLike,
    private readonly sink: Sink,
  ) {
    super(channel);
    sink.onfail = (error) => this.fail(error, true);
  }

  /** The recipient accepts the file list. */
  accept() {
    if (this.state.phase !== "deciding" || this.finished) return;
    clearTimeout(this.decisionTimer);
    this.send({ t: "accept", id: this.state.id });
    this.update({ phase: "transferring" });
    this.accepted();
  }

  /** The recipient declines. */
  decline(reason: "user" | "timeout" = "user") {
    if (this.state.phase !== "deciding" || this.finished) return;
    clearTimeout(this.decisionTimer);
    this.send({ t: "decline", id: this.state.id, reason });
    this.fail(new HanditError(reason === "timeout" ? "OFFER_TIMEOUT" : "OFFER_DECLINED"));
  }

  protected async main() {
    await Promise.race([this.acceptance, this.failure]);
    await Promise.race([this.done, this.failure]);
  }

  protected async handle(message: Control | ArrayBuffer) {
    if (message instanceof ArrayBuffer) return this.write(message);
    switch (message.t) {
      case "offer":
        if (this.assembler || this.state.phase !== "offering") throw protocolError("second offer");
        try {
          this.assembler = new OfferAssembler(message);
        } catch (error) {
          throw protocolError(String(error));
        }
        this.update({ id: message.id });
        return;
      case "offer_items":
        return this.addItems(message);
      case "file_start":
        return this.startFile(message.i);
      case "file_end":
        return this.endFile(message);
      case "file_abort":
        return this.abortFile(message.i);
      case "done":
        if (this.state.phase !== "transferring" || this.current) throw protocolError("early done");
        this.sendSummary();
        this.allDone();
        return;
      default:
        throw protocolError(`unexpected ${message.t}`);
    }
  }

  protected async cleanUp() {
    if (this.current) await this.sink.discard(this.state.id, this.current.i);
    this.current = undefined;
  }

  private addItems(message: Extract<Control, { t: "offer_items" }>) {
    if (!this.assembler) throw protocolError("items before offer");
    let items: OfferItem[] | null;
    try {
      items = this.assembler.add(message);
      // Every name becomes safe before it's shown or saved; unsafe paths reject the offer.
      if (items) items = makeSafe(items);
    } catch (error) {
      throw protocolError(String(error));
    }
    if (!items) return;
    const files = items.filter((x) => x.kind === "file");
    // No decision within 120 seconds counts as declining.
    this.decisionTimer = setTimeout(() => this.decline("timeout"), DECISION_TIMEOUT_MS);
    this.update({
      phase: "deciding",
      items,
      totalFiles: files.length,
      totalBytes: files.reduce((s, x) => s + x.size, 0),
    });
  }

  private async startFile(i: number) {
    const item = this.state.items[i];
    if (this.state.phase !== "transferring" || this.current || item?.kind !== "file") {
      throw protocolError("unexpected file_start");
    }
    if (this.finishedFiles.has(i)) throw protocolError("file sent twice");
    this.current = { i, received: 0 };
    await this.sink.begin(this.state.id, i);
  }

  private write(data: ArrayBuffer) {
    const current = this.current;
    const item = current && this.state.items[current.i];
    if (!current || !item) throw protocolError("data outside a file");
    const length = data.byteLength; // read before the sink takes the buffer
    current.received += length;
    if (current.received > item.size) throw protocolError("more data than declared");
    this.sink.write(data);
    this.update({ bytes: this.state.bytes + length });
  }

  private async endFile({ i, size, root }: Extract<Control, { t: "file_end" }>) {
    const current = this.current;
    if (current?.i !== i) throw protocolError("file_end for another file");
    const declared = this.state.items[i]?.size;
    const written = await this.sink.end();
    this.current = undefined;
    this.attempts[i] = (this.attempts[i] ?? 0) + 1;

    if (written.size === size && size === declared && written.root === root) {
      this.finishedFiles.add(i);
      this.setOutcome(i, { ok: true });
      this.send({ t: "file_result", i, ok: true });
      return;
    }
    // Not identical: never keep it. The sender tries once more.
    await this.sink.discard(this.state.id, i);
    this.update({ bytes: this.state.bytes - written.size });
    if (this.attempts[i] >= MAX_ATTEMPTS) {
      this.finishedFiles.add(i);
      this.setOutcome(i, { ok: false, code: "INTEGRITY_FAILED" });
    }
    this.send({ t: "file_result", i, ok: false, code: "INTEGRITY_FAILED" });
  }

  private async abortFile(i: number) {
    if (this.current?.i !== i) throw protocolError("file_abort for another file");
    this.current = undefined;
    await this.sink.discard(this.state.id, i);
    this.finishedFiles.add(i);
    this.setOutcome(i, { ok: false, code: "SOURCE_UNREADABLE" });
  }

  private setOutcome(i: number, outcome: FileOutcome) {
    const outcomes = { ...this.state.outcomes, [i]: outcome };
    this.update({ outcomes, filesDone: Object.values(outcomes).filter((o) => o.ok).length });
  }

  private sendSummary() {
    const ok: number[] = [];
    const failed: { i: number; code: FileFailCode }[] = [];
    const outcomes = { ...this.state.outcomes };
    for (const item of this.state.items) {
      if (item.kind !== "file") continue;
      const outcome = outcomes[item.i] ?? { ok: false, code: "INTEGRITY_FAILED" };
      outcomes[item.i] = outcome;
      if (outcome.ok) ok.push(item.i);
      else failed.push({ i: item.i, code: outcome.code });
    }
    this.update({ outcomes });
    this.send({ t: "summary", ok, failed });
  }
}

/** The error a sender or recipient shows for a code. */
export const errorFor = (code: ErrorCode, details?: string) => new HanditError(code, details);
