// The page's side of the storage worker (workers/store.ts): a Source that reads and
// hashes picked files, and a Sink that writes and hashes received files in OPFS.
import type { StoreReply, StoreRequest } from "../workers/store";
import { HanditError } from "./codes";
import type { BlockReader, Sink, Source } from "./transfer";

type Request = StoreRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

export class Store {
  private readonly worker = new Worker(new URL("../workers/store.ts", import.meta.url), {
    type: "module",
  });
  private readonly calls = new Map<
    number,
    { resolve(v: unknown): void; reject(e: unknown): void }
  >();
  private nextId = 1;
  /** Called when a background write fails (for example, storage ran out). */
  onfail: (error: HanditError) => void = () => {};

  constructor() {
    this.worker.onmessage = (event: MessageEvent<StoreReply>) => {
      const reply = event.data;
      const error = reply.ok ? undefined : new HanditError(reply.code, reply.details);
      if (reply.id === 0) {
        if (error) this.onfail(error);
        return;
      }
      const call = this.calls.get(reply.id);
      this.calls.delete(reply.id);
      if (error) call?.reject(error);
      else call?.resolve(reply.ok ? reply.value : undefined);
    };
  }

  call<T>(request: Request, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...request, id }, transfer);
    });
  }

  /** Fire-and-forget: the bytes move to the worker without being copied. */
  write(data: ArrayBuffer) {
    this.worker.postMessage({ id: 0, op: "recv.write", data }, [data]);
  }

  /** Deletes received data: one transfer, or everything left from earlier visits. */
  cleanup(transfer?: string) {
    return this.call<void>({ op: "cleanup", transfer });
  }

  terminate() {
    this.worker.terminate();
  }
}

/** Reads the picked files (by offer index) through the worker. */
export function fileSource(store: Store, files: Map<number, File>): Source {
  let opened = 0;
  return {
    open(i): BlockReader {
      const file = files.get(i);
      const key = `${i}:${opened++}`;
      const ready = file
        ? store.call<void>({ op: "read.open", key, file })
        : Promise.reject(new HanditError("SOURCE_UNREADABLE"));
      return {
        next: async () => {
          await ready;
          const block = await store.call<ArrayBuffer | null>({ op: "read.next", key });
          return block ? new Uint8Array(block) : null;
        },
        root: () => store.call<string>({ op: "read.root", key }),
      };
    },
  };
}

/** Writes received files into OPFS through the worker. */
export function opfsSink(store: Store): Sink {
  const sink: Sink = {
    begin: (transfer, i) => store.call<void>({ op: "recv.begin", transfer, i }),
    write: (data) => store.write(data),
    end: () => store.call<{ size: number; root: string }>({ op: "recv.end" }),
    discard: (transfer, i) => store.call<void>({ op: "recv.discard", transfer, i }),
  };
  store.onfail = (error) => sink.onfail?.(error);
  return sink;
}

/** A received file, read back from OPFS (disk-backed, not loaded into memory). */
export async function receivedFile(transfer: string, i: number): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const incoming = await root.getDirectoryHandle("incoming");
  const dir = await incoming.getDirectoryHandle(transfer);
  return (await dir.getFileHandle(String(i))).getFile();
}
