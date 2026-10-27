// Getting verified files out of the browser's private storage: one file as a normal
// download, several as a ZIP (store method), into a folder the user picks, or through
// the phone's share sheet. Also the storage check before Accept and the clean-up.
import { receivedFile } from "./files";
import { fitName, withNumber } from "./names";
import type { OfferItem } from "./protocol";
import { buildZip, type ZipEntry } from "./zip";

/** Free space needed on top of the files themselves. */
export const STORAGE_MARGIN = 64 * 1024 * 1024;

export interface StorageCheck {
  ok: boolean;
  needed: number;
  /** null when the browser can't say. */
  available: number | null;
}

/** The free quota must cover the total plus 64 MiB, or Accept stays disabled. */
export async function checkStorage(totalBytes: number): Promise<StorageCheck> {
  const needed = totalBytes + STORAGE_MARGIN;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined) return { ok: true, needed, available: null };
    const available = quota - (usage ?? 0);
    return { ok: available >= needed, needed, available };
  } catch {
    return { ok: true, needed, available: null };
  }
}

export interface SavedFile {
  item: OfferItem;
  /** Named after the last part of the safe path, with the sender's MIME type. */
  file: File;
  crc: number;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** The verified files of a transfer, read from OPFS (disk-backed, not loaded into memory). */
export async function openReceived(
  transfer: string,
  items: OfferItem[],
  ok: number[],
  crcs: Map<number, number>,
): Promise<SavedFile[]> {
  const files: SavedFile[] = [];
  for (const i of ok) {
    const item = items[i];
    if (!item) continue;
    const stored = await receivedFile(transfer, i);
    const file = new File([stored], baseName(item.path), {
      type: item.type || "application/octet-stream",
    });
    files.push({ item, file, crc: crcs.get(i) ?? 0 });
  }
  return files;
}

/** Starts a normal download. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking too early can cancel a download that is still starting.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** All verified files (and empty folders) as one ZIP with the store method. */
export function zipOf(files: SavedFile[], folders: OfferItem[]): Blob {
  const entries: ZipEntry[] = [
    ...folders.map((f): ZipEntry => ({ path: f.path, kind: "dir", size: 0, crc: 0 })),
    ...files.map(
      ({ item, file, crc }): ZipEntry => ({
        path: item.path,
        kind: "file",
        file,
        size: file.size,
        crc,
      }),
    ),
  ];
  return buildZip(entries);
}

/** "Holiday.zip" when everything is in one folder, otherwise "HANDit files.zip". */
export function zipName(items: OfferItem[]): string {
  const tops = new Set(items.map((x) => x.path.split("/")[0]));
  const [top] = tops;
  const oneFolder = tops.size === 1 && items.some((x) => x.path.includes("/"));
  return oneFolder && top ? fitName(top, ".zip") : "HANDit files.zip";
}

// showDirectoryPicker is only in some browsers ("Limited availability"), so it isn't in the DOM types.
type DirectoryPicker = (options: {
  mode: "readwrite";
  id?: string;
}) => Promise<FileSystemDirectoryHandle>;
const picker = () =>
  (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

export const canSaveToFolder = () =>
  typeof window !== "undefined" && typeof picker() === "function";

async function exists(dir: FileSystemDirectoryHandle, name: string) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    try {
      await dir.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }
}

/** Writes the files into a folder the user picks. Never overwrites: clashes get " (1)". */
export async function saveToFolder(files: SavedFile[], folders: OfferItem[]): Promise<void> {
  const pick = picker();
  if (!pick) throw new Error("Saving to a folder isn't available in this browser");
  const root = await pick({ mode: "readwrite", id: "handit" });
  const dirs = new Map<string, FileSystemDirectoryHandle>([["", root]]);
  const dirFor = async (path: string): Promise<FileSystemDirectoryHandle> => {
    const known = dirs.get(path);
    if (known) return known;
    const slash = path.lastIndexOf("/");
    const parent = await dirFor(slash < 0 ? "" : path.slice(0, slash));
    const handle = await parent.getDirectoryHandle(path.slice(slash + 1), { create: true });
    dirs.set(path, handle);
    return handle;
  };
  for (const folder of folders) await dirFor(folder.path);
  for (const { item, file } of files) {
    const slash = item.path.lastIndexOf("/");
    const dir = await dirFor(slash < 0 ? "" : item.path.slice(0, slash));
    let name = file.name;
    for (let n = 1; await exists(dir, name); n++) name = withNumber(file.name, n);
    const handle = await dir.getFileHandle(name, { create: true });
    await file.stream().pipeTo(await handle.createWritable());
  }
}

/** Phones: the share sheet (where "Save to Photos" lives). Must be called from a tap. */
export const canShare = (files: File[]) =>
  files.length > 0 && typeof navigator.canShare === "function" && navigator.canShare({ files });

export const share = (files: File[]) => navigator.share({ files });

/** Keeps another tab's clean-up away from this transfer's data while it's in use. */
export function holdTransfer(id: string): () => void {
  let release = () => {};
  void navigator.locks?.request(
    `handit:${id}`,
    () => new Promise<void>((resolve) => (release = resolve)),
  );
  return () => release();
}

/** Deletes received data left from earlier visits (but not what another open tab is using). */
export async function cleanUpLeftovers(): Promise<void> {
  try {
    const held = new Set(((await navigator.locks?.query())?.held ?? []).map((lock) => lock.name));
    const root = await navigator.storage.getDirectory();
    const incoming = await root.getDirectoryHandle("incoming");
    const names: string[] = [];
    for await (const name of (incoming as unknown as { keys(): AsyncIterable<string> }).keys()) {
      names.push(name);
    }
    for (const name of names) {
      if (!held.has(`handit:${name}`)) await incoming.removeEntry(name, { recursive: true });
    }
  } catch {
    // Nothing left over, or storage isn't available.
  }
}
