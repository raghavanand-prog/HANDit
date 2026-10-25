import { type AuthEnv, handleAuth } from "./auth";
import { reply } from "./headers";
import { clientKey } from "./limiter";
import { Close, parseJoin, refuse } from "./room";

export { Limiter } from "./limiter";
export { Room } from "./room";

// The site itself is served as static assets; the Worker only handles /ws/<room id>.
const ROOM_PATH = /^\/ws\/([0-9a-f]{32})$/;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Optional sign-in (/auth/*): nothing here is needed to send or receive files.
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

    const limiter = env.LIMITER.getByName(clientKey(request));
    if (!(await limiter.allow(join.role === "owner" ? "room" : "join"))) {
      return refuse(Close.TOO_MANY, "Too many attempts");
    }
    return env.ROOM.getByName(roomId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
