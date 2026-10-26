import { type AuthEnv, handleAuth } from "./auth";
import { reply } from "./headers";
import { clientKey, WIDE_SCALE, wideKey } from "./limiter";
import { Close, parseJoin, refuse } from "./room";

export { Limiter } from "./limiter";
export { Room } from "./room";

// The site itself is served as static assets; the Worker only handles /ws/<room id>.
const ROOM_PATH = /^\/ws\/([0-9a-f]{32})$/;
// The two sign-in routes that make the Worker call GitHub or Google. Counted per IP, so nobody can
// use the site to hammer a provider with our client secret or to burn the free request quota.
const SIGN_IN_PATH = /^\/auth\/(github|google)\/(start|callback)$/;

/** True if the request has no Origin, or an Origin that is this site (or a listed development one). */
export function originAllowed(request: Request, url: URL, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  if (origin === url.origin) return true;
  const extra = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

/** Only the local test server is "local": the test-only settings do nothing anywhere else. */
const isLocal = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

/** Hosts the flood guard skips: the local test server and the Worker's own tests (.test can't be a real site). */
const skipsFloodGuard = (url: URL) => isLocal(url) || url.hostname.endsWith(".test");

/**
 * The cheap first check, before any Durable Object: a rate limit per client address. If the
 * binding is missing or fails, the request goes on to the Limiter, which still counts exactly.
 */
async function withinRate(request: Request, env: Env, kind: "room" | "join" | "auth") {
  const guard = { room: env.ROOM_FLOOD, join: env.JOIN_FLOOD, auth: env.AUTH_FLOOD }[kind];
  try {
    return !guard || (await guard.limit({ key: clientKey(request) })).success;
  } catch {
    return true;
  }
}

/** Counts an attempt for this client's /64 (or IPv4 address) and, for IPv6, its whole /48. */
async function allowed(request: Request, env: Env, kind: "room" | "join" | "auth", url: URL) {
  const local = isLocal(url);
  if (!skipsFloodGuard(url) && !(await withinRate(request, env, kind))) return false;
  if (!(await env.LIMITER.getByName(clientKey(request)).allow(kind, local))) return false;
  const wide = wideKey(request);
  return wide === null || (await env.LIMITER.getByName(wide).allow(kind, local, WIDE_SCALE));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Optional sign-in (/auth/*): nothing here is needed to send or receive files.
    if (SIGN_IN_PATH.test(url.pathname)) {
      if (!(await allowed(request, env, "auth", url))) return reply("Too many attempts", 429);
    }
    const auth = await handleAuth(request, env as unknown as AuthEnv);
    if (auth) return auth;
    const roomId = url.pathname.match(ROOM_PATH)?.[1];
    if (!roomId) return reply("Not found", 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return reply("WebSocket upgrade required", 426);
    }
    // A browser page on another site can't use this server: its Origin must be ours (or a
    // development origin listed in ALLOWED_ORIGINS). Requests without an Origin aren't
    // browser pages; they get no extra access, since the Room's rules apply to everyone.
    if (!originAllowed(request, url, env)) return reply("Forbidden", 403);
    const join = parseJoin(url);
    if (!join) return reply("Bad request", 400);

    if (!(await allowed(request, env, join.role === "owner" ? "room" : "join", url))) {
      return refuse(Close.TOO_MANY, "Too many attempts");
    }
    return env.ROOM.getByName(roomId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
