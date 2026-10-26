// One session per tab: a code (or a link), the introduction, the direct connection and
// one transfer, followed through the states of the plan. The screens only read this
// state and call these methods; they never touch WebRTC, Web Crypto or storage.
import { HanditError, toHanditError } from "./codes";
import { fileSource, opfsSink, Store } from "./files";
import { encodeLink, type Link, Mode, newSecret, roomIdFor } from "./link";
import { type Picked, toOffer } from "./picked";
import { type OfferItem, parseControl } from "./protocol";
import { type Connection, type Device, introduce } from "./rtc";
import {
  checkStorage,
  holdTransfer,
  openReceived,
  type SavedFile,
  type StorageCheck,
} from "./save";
import { createSeal, type Role } from "./seal";
import { openSignal, roomUrl } from "./signal";
import { Receiver, Sender, type TransferState } from "./transfer";

/** In RECEIVE mode the sender has 3 minutes to pick files. */
export const CHOOSE_TIMEOUT_MS = 3 * 60_000;

export type Stage =
  | "preparing" // getting the code ready
  | "code" // the owner shows the code
  | "expired" // the code ran out before anyone joined
  | "joining" // the guest opened the link and is connecting
  | "connecting" // both devices are setting up the direct connection
  | "choosing" // the sender picks files (RECEIVE mode); the recipient waits
  | "confirming" // the sender checks who joined and taps Allow
  | "awaiting" // the sender waits for the recipient to accept
  | "review" // the recipient reviews the file list
  | "transferring"
  | "complete"
  | "failed";

export interface SessionState {
  stage: Stage;
  role: Role;
  mode: Mode;
  /** True on the device that sends the files. */
  sending: boolean;
  link?: string;
  /** When the code expires, in milliseconds since 1970. */
  expiresAt?: number;
  peer?: Device;
  transfer?: TransferState;
  /** Smoothed bytes per second, for "about 20 s left". */
  rate?: number;
  storage?: StorageCheck;
  /** Recipient: verified files, ready to save (after a failure, the ones that finished). */
  saved?: SavedFile[];
  folders?: OfferItem[];
  /** When the transfer finished, in milliseconds since 1970. */
  finishedAt?: number;
  error?: HanditError;
}

export interface SessionOptions {
  origin: string;
  me: Device;
  /** Code lifetime in seconds: 60, 120 or 300. */
  lifetime: number;
  /** The sender taps Allow before the file list is sent. */
  confirmReceiver: boolean;
}

export class Session {
  state: SessionState;
  private readonly listeners = new Set<() => void>();
  private closeSignal?: () => void;
  private connection?: Connection;
  private store?: Store;
  private engine?: Sender | Receiver;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private release?: () => void;
  private picked?: Picked[];
  private allowed?: (allow: boolean) => void;
  private chosen?: (picked: Picked[]) => void;
  private stopWaiting?: () => void;
  private sample?: { at: number; bytes: number };
  private disposed = false;

  private constructor(
    private readonly options: SessionOptions,
    initial: Pick<SessionState, "role" | "mode" | "sending" | "stage">,
  ) {
    this.state = initial;
  }

  /** The device that shows the code. In SEND mode it already has the files. */
  static owner(options: SessionOptions, mode: Mode, picked?: Picked[]) {
    const session = new Session(options, {
      role: "owner",
      mode,
      sending: mode === Mode.SEND,
      stage: "preparing",
    });
    session.picked = picked;
    void session.runOwner();
    return session;
  }

  /** The device that opened the link. */
  static guest(options: SessionOptions, link: Link) {
    const session = new Session(options, {
      role: "guest",
      mode: link.mode,
      sending: link.mode === Mode.RECEIVE,
      stage: "joining",
    });
    void session.runGuest(link);
    return session;
  }

  // For React's useSyncExternalStore.
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  /** Sender, RECEIVE mode: the files to send. */
  choose(picked: Picked[]) {
    this.chosen?.(picked);
  }

  /** Sender: "Confirm who receives" — Allow (or not). */
  allow(allow: boolean) {
    this.allowed?.(allow);
  }

  /** Recipient: accept the file list (only when there's enough storage). */
  accept() {
    // Not before the storage check has said there is room.
    if (!(this.engine instanceof Receiver) || this.state.storage?.ok !== true) return;
    this.release = holdTransfer(this.engine.state.id);
    this.engine.accept();
  }

  decline() {
    if (this.engine instanceof Receiver) this.engine.decline();
  }

  /** Cancel at any stage; the other device is told. */
  cancel() {
    if (this.engine && !["complete", "failed"].includes(this.engine.state.phase)) {
      this.engine.cancel();
      return;
    }
    this.sendCancel();
    this.fail(new HanditError("CANCELLED_BY_USER"));
  }

  /**
   * The page is going away (tab closed, navigated away): close the connection straight
   * away so the other device learns it at once (PEER_LEFT) instead of after a timeout.
   */
  leave() {
    this.closeConnection();
  }

  /** Leaves the session and deletes any received data it still holds. */
  async dispose() {
    if (this.disposed) return;
    this.cancelIfRunning();
    this.disposed = true;
    this.clearTimers();
    this.stopWaiting?.();
    this.closeConnection();
    const id = this.engine?.state.id;
    try {
      if (this.store && id && !this.state.sending) await this.store.cleanup(id);
    } finally {
      this.store?.terminate();
      this.release?.();
    }
  }

  private set(change: Partial<SessionState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  private async runOwner() {
    const { origin, me, lifetime } = this.options;
    try {
      const secret = newSecret();
      const roomId = await roomIdFor(secret);
      const signal = openSignal(
        roomUrl(origin, roomId, "owner", lifetime),
        await createSeal(secret, roomId, "owner"),
      );
      this.closeSignal = () => signal.close();
      const connected = introduce({
        signal,
        role: "owner",
        me,
        mode: this.state.mode,
        onJoined: (peer) => {
          this.clearTimers();
          this.set({ stage: "connecting", peer, link: undefined });
        },
      });
      connected.catch(() => {}); // handled below
      await signal.ready;
      const expiresAt = Date.now() + lifetime * 1000;
      const link = encodeLink(origin, {
        mode: this.state.mode,
        expiresAt: Math.floor(expiresAt / 1000),
        secret,
      });
      this.set({ stage: "code", link, expiresAt });
      // The Room refuses guests after this; the socket stays open so late guests learn the code expired.
      this.later(lifetime * 1000, () => {
        if (this.state.stage === "code") this.set({ stage: "expired", link: undefined });
      });
      await this.connected(await connected);
    } catch (error) {
      this.fail(error);
    }
  }

  private async runGuest(link: Link) {
    const { origin, me } = this.options;
    try {
      const roomId = await roomIdFor(link.secret);
      const signal = openSignal(
        roomUrl(origin, roomId, "guest"),
        await createSeal(link.secret, roomId, "guest"),
      );
      this.closeSignal = () => signal.close();
      await this.connected(await introduce({ signal, role: "guest", me, mode: link.mode }));
    } catch (error) {
      this.fail(error);
    }
  }

  private async connected(connection: Connection) {
    if (this.disposed) {
      connection.pc.close();
      return;
    }
    this.connection = connection;
    this.store = new Store();
    this.set({ peer: connection.peer });

    if (!this.state.sending) return this.receive();

    let picked = this.picked;
    if (!picked) {
      this.set({ stage: "choosing" });
      this.waitQuietly();
      this.later(CHOOSE_TIMEOUT_MS, () => {
        this.sendCancel();
        this.fail(new HanditError("OFFER_TIMEOUT"));
      });
      picked = await new Promise<Picked[]>((resolve) => (this.chosen = resolve));
      this.clearTimers();
    } else if (this.options.confirmReceiver) {
      this.set({ stage: "confirming" });
      this.waitQuietly();
      const allow = await new Promise<boolean>((resolve) => (this.allowed = resolve));
      if (!allow) {
        this.sendCancel();
        return this.fail(new HanditError("CANCELLED_BY_USER"));
      }
    }
    this.stopWaiting?.();
    if (this.state.stage === "failed") return;
    await this.send(picked);
  }

  private async send(picked: Picked[]) {
    const { connection, store } = this;
    if (!connection || !store) return;
    const { items, files } = toOffer(picked);
    const sender = new Sender(connection.channel, items, fileSource(store, files));
    this.engine = sender;
    sender.onchange = (t) =>
      this.track(t, t.phase === "transferring" ? "transferring" : "awaiting");
    const final = await sender.run();
    this.finish(final);
  }

  private async receive() {
    const { connection, store } = this;
    if (!connection || !store) return;
    const sink = opfsSink(store);
    const receiver = new Receiver(connection.channel, sink);
    this.engine = receiver;
    // Waiting for the file list: the sender is choosing files, or confirming who receives.
    this.set({ stage: this.state.role === "owner" ? "choosing" : "connecting" });
    this.later(CHOOSE_TIMEOUT_MS + 10_000, () => {
      if (receiver.state.phase === "offering") receiver.abort(new HanditError("OFFER_TIMEOUT"));
    });
    let checked = false;
    receiver.onchange = (t) => {
      if (t.phase === "deciding") {
        this.track(t, "review");
        if (!checked) {
          checked = true;
          void checkStorage(t.totalBytes).then((storage) => this.set({ storage }));
        }
      } else if (t.phase === "transferring") {
        this.track(t, "transferring");
      }
    };
    const final = await receiver.run();
    const ok = Object.entries(final.outcomes)
      .filter(([, outcome]) => outcome.ok)
      .map(([i]) => Number(i));
    let saved: SavedFile[] = [];
    try {
      if (final.id && ok.length > 0)
        saved = await openReceived(final.id, final.items, ok, sink.crcs);
    } catch {
      // Storage became unreadable; the failure below explains what happened.
    }
    this.set({ saved, folders: final.items.filter((x) => x.kind === "dir") });
    this.finish(final);
  }

  private track(transfer: TransferState, stage: Stage) {
    const now = Date.now();
    let rate = this.state.rate;
    if (stage === "transferring") {
      if (!this.sample) this.sample = { at: now, bytes: transfer.bytes };
      else if (now - this.sample.at >= 1000) {
        const current = ((transfer.bytes - this.sample.bytes) * 1000) / (now - this.sample.at);
        rate = rate === undefined ? current : rate * 0.7 + current * 0.3;
        this.sample = { at: now, bytes: transfer.bytes };
      }
    }
    this.set({ stage, transfer, rate });
  }

  private finish(final: TransferState) {
    this.clearTimers();
    if (final.phase === "complete") {
      this.set({ stage: "complete", transfer: final, finishedAt: Date.now() });
    } else this.fail(final.error ?? new HanditError("UNKNOWN_ERROR"), final);
  }

  private fail(error: unknown, transfer?: TransferState) {
    if (this.state.stage === "failed" || this.state.stage === "complete") return;
    this.clearTimers();
    this.closeConnection();
    this.set({ stage: "failed", error: toHanditError(error), ...(transfer ? { transfer } : {}) });
  }

  /** While the sender chooses files or confirms: answer pings, notice the other side leaving. */
  private waitQuietly() {
    const channel = this.connection?.channel;
    if (!channel) return;
    const onMessage = (event: MessageEvent) => {
      const message = typeof event.data === "string" ? parseControl(event.data) : null;
      if (message?.t === "ping") channel.send(JSON.stringify({ t: "pong" }));
      if (message?.t === "cancel") this.fail(new HanditError("CANCELLED_BY_PEER"));
    };
    const onClose = () => this.fail(new HanditError("PEER_LEFT"));
    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose);
    this.stopWaiting = () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
      this.stopWaiting = undefined;
    };
  }

  private sendCancel() {
    const channel = this.connection?.channel;
    if (channel?.readyState === "open") channel.send(JSON.stringify({ t: "cancel" }));
  }

  private cancelIfRunning() {
    if (["complete", "failed"].includes(this.state.stage)) return;
    if (this.engine && !["complete", "failed"].includes(this.engine.state.phase))
      this.engine.cancel();
    else this.sendCancel();
  }

  private closeConnection() {
    this.closeSignal?.();
    this.stopWaiting?.();
    try {
      this.connection?.channel.close();
      this.connection?.pc.close();
    } catch {
      // already closed
    }
  }

  private later(ms: number, run: () => void) {
    this.timers.push(setTimeout(run, ms));
  }

  private clearTimers() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
