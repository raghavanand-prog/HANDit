import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";

// The service worker is a plain script. It is run here against small stand-ins for the browser's
// caches, so its rules for what it accepts and what it keeps can be checked without a browser.
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://handit.test";

type Listener = (event: FetchEventLike) => void;
interface FetchEventLike {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

function load() {
  const stores = new Map<string, Map<string, Response>>();
  const listeners: Record<string, Listener> = {};
  const key = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        put: async (r: Request | string, response: Response) => void store.set(key(r), response),
        match: async (r: Request | string) => store.get(key(r)),
        keys: async () => [...store.keys()],
      };
    },
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  new Function("self", "caches", source)(self, caches);
  const dispatch = async (request: Request) => {
    let result: Promise<Response> | Response | undefined;
    listeners.fetch?.({
      request,
      respondWith: (r) => {
        result = r;
      },
    });
    return result === undefined ? undefined : await result;
  };
  return { stores, dispatch };
}

const share = (files: File[], headers: Record<string, string> = {}) => {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return new Request(`${ORIGIN}/share-target`, { method: "POST", body: form, headers });
};
const photo = (n = 0) => new File([new Uint8Array(10)], `IMG_${n}.jpg`, { type: "image/jpeg" });

let sw: ReturnType<typeof load>;
beforeEach(() => {
  sw = load();
});

describe("files shared into the app (S4)", () => {
  test("a share from the app's own origin or the system share sheet is accepted", async () => {
    const accepted: Record<string, string>[] = [
      {}, // browsers that send no fetch metadata
      { "Sec-Fetch-Site": "none" },
      { "Sec-Fetch-Site": "same-origin" },
      { Origin: ORIGIN },
    ];
    for (const headers of accepted) {
      const response = await sw.dispatch(share([photo()], headers));
      expect(response?.status).toBe(303);
      expect(response?.headers.get("location")).toMatch(
        /^https:\/\/handit\.test\/send\?shared=[0-9a-f]{32}$/,
      );
    }
  });

  test("a form posted from another website is refused and nothing is stored", async () => {
    const refused: Record<string, string>[] = [
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
      { Origin: "https://evil.example" },
      { Origin: "null" },
    ];
    for (const headers of refused) {
      const response = await sw.dispatch(share([photo()], headers));
      expect(response?.status).toBe(403);
    }
    expect(sw.stores.get("handit-share")?.size ?? 0).toBe(0);
  });

  test("more than 1,000 files in one share is refused", async () => {
    const files = Array.from({ length: 1001 }, (_, i) => photo(i));
    const response = await sw.dispatch(share(files));
    expect(response?.status).toBe(413);
    expect(sw.stores.get("handit-share")?.size ?? 0).toBe(0);
  });

  test("a share is kept under a random id for the page to collect", async () => {
    await sw.dispatch(share([photo(1), photo(2)]));
    const keys = [...(sw.stores.get("handit-share")?.keys() ?? [])];
    expect(keys).toHaveLength(2);
    for (const k of keys) expect(k).toMatch(/\/__share\/[0-9a-f]{32}\/[01]$/);
  });
});

describe("what the shell cache keeps (S4)", () => {
  const get = (path: string, mode: RequestMode = "no-cors") =>
    new Request(`${ORIGIN}${path}`, { mode });
  const respond = (body: string, type: string) => () =>
    Promise.resolve(new Response(body, { headers: { "content-type": type } }));

  test("a real script is cached", async () => {
    globalThis.fetch = respond("console.log(1)", "text/javascript") as typeof fetch;
    const request = get("/assets/index-abc.js");
    Object.defineProperty(request, "destination", { value: "script" });
    await sw.dispatch(request);
    expect([...(sw.stores.get("handit-shell-v2")?.keys() ?? [])]).toContain(
      `${ORIGIN}/assets/index-abc.js`,
    );
  });

  test("an HTML page served for a missing asset is not cached as that asset", async () => {
    // The single-page fallback answers 200 with the app's HTML for unknown paths.
    globalThis.fetch = respond("<!doctype html>", "text/html; charset=utf-8") as typeof fetch;
    const request = get("/assets/index-gone.js");
    Object.defineProperty(request, "destination", { value: "script" });
    const response = await sw.dispatch(request);
    expect(response).toBeDefined(); // still returned to the page
    expect(sw.stores.get("handit-shell-v2")?.size ?? 0).toBe(0);
  });

  test("a failed response is never cached", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("nope", { status: 404 }))) as typeof fetch;
    const request = get("/assets/index-404.js");
    Object.defineProperty(request, "destination", { value: "script" });
    await sw.dispatch(request);
    expect(sw.stores.get("handit-shell-v2")?.size ?? 0).toBe(0);
  });
});
