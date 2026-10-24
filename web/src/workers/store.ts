// Runs off the main thread so the page stays responsive:
// - sending: reads picked files in 1 MiB blocks and hashes exactly what it reads;
// - receiving: writes incoming bytes to the origin private file system (OPFS) with a
//   sync access handle and hashes exactly what it writes.
// Received files live in OPFS at incoming/<transfer id>/<index> until saved or cleaned up.
import { BLOCK_BYTES, BlockHasher } from "../core/hash";

// The parts of the worker and OPFS APIs used here (not in TypeScript's DOM types).
interface SyncAccessHandle {
  write(buffer: ArrayBuffer, options: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const scope = self as unknown as WorkerScope;

export type StoreRequest =
  | { id: number; op: "read.open"; key: string; file: File }
  | { id: number; op: "read.next"; key: string }
  | { id: number; op: "read.root"; key: string }
  | { id: number; op: "recv.begin"; transfer: string; i: number }
  | { id: 0; op: "recv.write"; data: ArrayBuffer }
  | { id: number; op: "recv.end" }
  | { id: number; op: "recv.discard"; transfer: string; i: number }
  | { id: number; op: "cleanup"; transfer?: string };

export type StoreReply =
  | { id: number; ok: true; value?: unknown }
  | {
      id: number;
      ok: false;
      code: "SOURCE_UNREADABLE" | "STORAGE_FULL" | "UNKNOWN_ERROR";
      details: string;
    };

const readers = new Map<string, { file: File; offset: number; hasher: BlockHasher }>();
let receiving:
  | {
      transfer: string;
      i: number;
      handle: SyncAccessHandle;
      at: number;
      hasher: BlockHasher;
      error?: unknown;
    }
  | undefined;

async function incoming(create: boolean) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("incoming", { create });
}

async function handle(request: StoreRequest): Promise<unknown> {
  switch (request.op) {
    case "read.open":
      readers.set(request.key, { file: request.file, offset: 0, hasher: new BlockHasher() });
      return;
    case "read.next": {
      const reader = readers.get(request.key);
      if (!reader) throw new Error("no such reader");
      if (reader.offset >= reader.file.size) return null;
      let block: ArrayBuffer;
      try {
        block = await reader.file.slice(reader.offset, reader.offset + BLOCK_BYTES).arrayBuffer();
      } catch (error) {
        readers.delete(request.key);
        throw Object.assign(new Error(String(error)), { code: "SOURCE_UNREADABLE" });
      }
      reader.offset += block.byteLength;
      await reader.hasher.update(new Uint8Array(block));
      return block;
    }
    case "read.root": {
      const reader = readers.get(request.key);
      readers.delete(request.key);
      if (!reader) throw new Error("no such reader");
      return reader.hasher.root();
    }
    case "recv.begin": {
      const dir = await (await incoming(true)).getDirectoryHandle(request.transfer, {
        create: true,
      });
      const file = await dir.getFileHandle(String(request.i), { create: true });
      const access = (await (
        file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
      ).createSyncAccessHandle()) as SyncAccessHandle;
      access.truncate(0);
      receiving = {
        transfer: request.transfer,
        i: request.i,
        handle: access,
        at: 0,
        hasher: new BlockHasher(),
      };
      return;
    }
    case "recv.write": {
      const current = receiving;
      if (!current || current.error) return;
      try {
        current.at += current.handle.write(request.data, { at: current.at });
        await current.hasher.update(new Uint8Array(request.data));
      } catch (error) {
        current.error = error;
        scope.postMessage(failure(0, error));
      }
      return;
    }
    case "recv.end": {
      const current = receiving;
      receiving = undefined;
      if (!current) throw new Error("nothing being received");
      current.handle.flush();
      current.handle.close();
      if (current.error) throw current.error;
      return { size: current.at, root: await current.hasher.root() };
    }
    case "recv.discard": {
      if (receiving?.transfer === request.transfer && receiving.i === request.i) {
        receiving.handle.close();
        receiving = undefined;
      }
      try {
        const dir = await (await incoming(false)).getDirectoryHandle(request.transfer);
        await dir.removeEntry(String(request.i));
      } catch {
        // already gone
      }
      return;
    }
    case "cleanup": {
      try {
        if (request.transfer)
          await (await incoming(false)).removeEntry(request.transfer, { recursive: true });
        else
          await (await navigator.storage.getDirectory()).removeEntry("incoming", {
            recursive: true,
          });
      } catch {
        // nothing to clean up
      }
      return;
    }
  }
}

function failure(id: number, error: unknown): StoreReply {
  const name = (error as { name?: string })?.name;
  const code = (error as { code?: string })?.code;
  return {
    id,
    ok: false,
    code:
      code === "SOURCE_UNREADABLE"
        ? "SOURCE_UNREADABLE"
        : name === "QuotaExceededError"
          ? "STORAGE_FULL"
          : "UNKNOWN_ERROR",
    details: String(error),
  };
}

// Requests are handled strictly in order, one at a time.
let queue = Promise.resolve();
scope.onmessage = (event) => {
  const request = event.data as StoreRequest;
  queue = queue.then(async () => {
    try {
      const value = await handle(request);
      if (request.id === 0) return;
      const transfer = value instanceof ArrayBuffer ? [value] : [];
      scope.postMessage({ id: request.id, ok: true, value } satisfies StoreReply, transfer);
    } catch (error) {
      scope.postMessage(failure(request.id, error));
    }
  });
};
