// What the sender picked: files and folders from a file input, a folder input or a
// drag-and-drop, turned into the offer's item list. Nothing is read or converted here.
import type { OfferItem } from "./protocol";

export interface Picked {
  path: string;
  kind: "file" | "dir";
  file?: File;
}

/** From <input type="file"> (with or without webkitdirectory). */
export function fromFiles(files: Iterable<File>): Picked[] {
  return [...files].map((file) => ({
    path: file.webkitRelativePath || file.name,
    kind: "file",
    file,
  }));
}

/** From a drop, including whole folders (and empty folders inside them). */
export async function fromDrop(data: DataTransfer): Promise<Picked[]> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length === 0) return fromFiles(data.files);

  const picked: Picked[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    const path = entry.fullPath.replace(/^\/+/, "");
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      picked.push({ path, kind: "file", file });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    // readEntries returns results in batches until it returns an empty one.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      children.push(...batch);
    }
    if (children.length === 0) picked.push({ path, kind: "dir" });
    for (const child of children) await walk(child);
  };
  for (const entry of entries) await walk(entry);
  return picked;
}

/** Adds new picks, skipping exact duplicates of what's already there. */
export function merge(current: Picked[], added: Picked[]): Picked[] {
  const key = (p: Picked) =>
    `${p.kind}:${p.path}:${p.file?.size ?? 0}:${p.file?.lastModified ?? 0}`;
  const seen = new Set(current.map(key));
  return [...current, ...added.filter((p) => !seen.has(key(p)))];
}

export function totals(picked: Picked[]) {
  return {
    count: picked.length,
    bytes: picked.reduce((sum, p) => sum + (p.file?.size ?? 0), 0),
  };
}

/** The offer's item list, and the files by item index. */
export function toOffer(picked: Picked[]): { items: OfferItem[]; files: Map<number, File> } {
  const files = new Map<number, File>();
  const items = picked.map((p, i): OfferItem => {
    if (p.file) files.set(i, p.file);
    return {
      i,
      path: p.path,
      size: p.file?.size ?? 0,
      kind: p.kind,
      type: p.file?.type ?? "",
    };
  });
  return { items, files };
}
