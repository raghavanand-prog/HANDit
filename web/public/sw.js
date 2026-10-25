// HANDit's service worker. It does two small jobs and nothing else:
//
// 1. Keeps the page shell (the HTML, its scripts and styles, the icons) so the installed app opens
//    even when the network is down, and says so plainly instead of showing a browser error.
//    It never caches a WebSocket, a POST, another origin, or anything a transfer touches.
// 2. Receives files shared into the installed app (Android's Share menu): it hands them to the
//    Send page through a temporary cache entry that the page deletes as soon as it has the files.
const SHELL = "handit-shell-v2";
const SHARE = "handit-share";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== SHELL && name !== SHARE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// Files that belong to the shell: the page, its hashed assets, the icons and the manifest.
const isShellPath = (path) =>
  path === "/" ||
  path.startsWith("/assets/") ||
  /^\/(icon-|apple-touch-icon|favicon|manifest)/.test(path);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Sign-in is never cached or touched: the browser talks to the server directly.
  if (url.pathname.startsWith("/auth/")) return;

  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;

  // Pages: the network first; if it is down, the cached shell (the app decides what to show).
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
            // Every page of the app is the same shell; keep one copy.
            (await caches.open(SHELL)).put("/", response.clone());
          }
          return response;
        } catch {
          const cached = await (await caches.open(SHELL)).match("/");
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed assets never change: cache first.
  if (isShellPath(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

async function receiveShare(request) {
  const form = await request.formData();
  const id = crypto.randomUUID().replaceAll("-", "");
  const cache = await caches.open(SHARE);
  let n = 0;
  for (const entry of form.getAll("files")) {
    if (typeof entry === "string") continue;
    await cache.put(
      new Request(`/__share/${id}/${n++}`),
      new Response(entry, {
        headers: {
          "Content-Type": entry.type || "application/octet-stream",
          "X-Handit-Name": encodeURIComponent(entry.name),
          "X-Handit-Modified": String(entry.lastModified),
        },
      }),
    );
  }
  return Response.redirect(`/send?shared=${id}`, 303);
}
