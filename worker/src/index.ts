export { Room } from "./room";

// The site itself is served as static assets; the Worker only handles /ws/<room id>.
const ROOM_PATH = /^\/ws\/([0-9a-f]{32})$/;

export default {
  async fetch(request, env) {
    const roomId = new URL(request.url).pathname.match(ROOM_PATH)?.[1];
    if (!roomId) return new Response("Not found", { status: 404 });
    return env.ROOM.getByName(roomId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
