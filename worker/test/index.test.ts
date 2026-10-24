import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";
import { newRoomId } from "./helpers";

const fetchPath = (path: string, init?: RequestInit) =>
  exports.default.fetch(`https://handit.test${path}`, init);
const upgrade = { headers: { Upgrade: "websocket" } };

test.each([
  "/ws/",
  "/ws/0123456789ABCDEF0123456789ABCDEF", // upper case
  "/ws/0123456789abcdef0123456789abcde", // 31 characters
  "/ws/0123456789abcdef0123456789abcdef0", // 33 characters
  "/ws/0123456789abcdef0123456789abcdef/extra",
  "/anything-else",
])("%s is not found", async (path) => {
  expect((await fetchPath(path, upgrade)).status).toBe(404);
});

test("a room path without a WebSocket upgrade is refused", async () => {
  expect((await fetchPath(`/ws/${newRoomId()}?role=guest`)).status).toBe(426);
});

test.each([
  "",
  "role=admin",
  "role=owner", // no lifetime
  "role=owner&ttl=90", // only 60, 120 or 300
  "role=owner&ttl=120x",
])("query '%s' is a bad request", async (query) => {
  expect((await fetchPath(`/ws/${newRoomId()}?${query}`, upgrade)).status).toBe(400);
});
