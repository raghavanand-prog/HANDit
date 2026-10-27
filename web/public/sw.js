// HANDit's service worker. It does two small jobs and nothing else:
//
// 1. Keeps the page shell (the HTML, its scripts and styles, the icons) so the installed app opens
//    even when the network is down, and says so plainly instead of showing a browser error.
//    It never caches a WebSocket, a POST, another origin, or anything a transfer touches.
// 2. Receives files shared into the installed app (Android's Share menu): it hands them to the
//    Send page through a temporary cache entry that the page deletes as soon as it has the files.
const SHELL = "handit-shell-v2";
const SHARE = "handit-share";
// More files than this in one share is refused: nobody shares that many by hand.
const MAX_SHARED_FILES = 1000;

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

/**
 * True for a request that came from the app itself or the phone's share sheet. A form on another
 * website can post to /share-target too, and would otherwise fill the person's send list.
 * Browsers that send fetch metadata say so in Sec-Fetch-Site; for the others, an Origin header
 * that isn't ours gives it away.
 */
function fromOurSide(request) {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site !== null) return site === "none" || site === "same-origin";
  const origin = request.headers.get("Origin");
  return origin === null || origin === self.location.origin;
}

/**
 * Whether a response may be kept. The single-page fallback answers any unknown path with the
 * app's HTML and status 200; kept under a script's address it would break the app offline.
 */
function worthKeeping(request, response) {
  if (!response.ok || response.type === "opaque" || response.type === "opaqueredirect")
    return false;
  const type = response.headers.get("content-type") ?? "";
  return request.destination === "document" || !type.includes("text/html");
}

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
        if (worthKeeping(request, response)) cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

async function receiveShare(request) {
  if (!fromOurSide(request)) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const shared = form.getAll("files").filter((entry) => typeof entry !== "string");
  if (shared.length > MAX_SHARED_FILES) return new Response("Too many files", { status: 413 });
  const id = crypto.randomUUID().replaceAll("-", "");
  const cache = await caches.open(SHARE);
  let n = 0;
  for (const entry of shared) {
    await cache.put(
      new Request(new URL(`/__share/${id}/${n++}`, self.location.origin).href),
      new Response(entry, {
        headers: {
          "Content-Type": entry.type || "application/octet-stream",
          "X-Handit-Name": encodeURIComponent(entry.name),
          "X-Handit-Modified": String(entry.lastModified),
        },
      }),
    );
  }
  return Response.redirect(new URL(`/send?shared=${id}`, self.location.origin).href, 303);
}
