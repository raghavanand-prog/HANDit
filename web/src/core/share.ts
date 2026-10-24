// Files shared into the installed app (Android's Share menu). The service worker puts them in a
// temporary cache entry and opens /send?shared=<id>; the page takes them out and deletes the
// entry straight away, so nothing the user shared stays behind in the browser.
const SHARE = "handit-share";

export async function takeSharedFiles(id: string): Promise<File[]> {
  if (!/^[0-9a-f]{32}$/.test(id) || typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(SHARE);
    const files: File[] = [];
    for (const request of await cache.keys()) {
      if (!new URL(request.url).pathname.startsWith(`/__share/${id}/`)) continue;
      const response = await cache.match(request);
      await cache.delete(request);
      if (!response) continue;
      files.push(
        new File(
          [await response.blob()],
          decodeURIComponent(response.headers.get("X-Handit-Name") ?? "file"),
          {
            type: response.headers.get("Content-Type") ?? "",
            lastModified: Number(response.headers.get("X-Handit-Modified")) || Date.now(),
          },
        ),
      );
    }
    return files;
  } catch {
    return [];
  }
}

/** Anything left from a share that was never opened (older than this visit) is deleted. */
export async function clearSharedFiles(): Promise<void> {
  try {
    if (typeof caches !== "undefined") await caches.delete(SHARE);
  } catch {
    // nothing to clear
  }
}
