import { clientKey } from "./limiter";
import { Close, parseJoin, refuse } from "./room";

export { Limiter } from "./limiter";
export { Room } from "./room";

// The site itself is served as static assets; the Worker only handles /ws/<room id>.
const ROOM_PATH = /^\/ws\/([0-9a-f]{32})$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomId = url.pathname.match(ROOM_PATH)?.[1];
    if (!roomId) return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const join = parseJoin(url);
    if (!join) return new Response("Bad request", { status: 400 });

    const limiter = env.LIMITER.getByName(clientKey(request));
    if (!(await limiter.allow(join.role === "owner" ? "room" : "join"))) {
      return refuse(Close.TOO_MANY, "Too many attempts");
    }
    return env.ROOM.getByName(roomId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
