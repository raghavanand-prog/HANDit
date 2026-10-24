import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

const ROOM_ID = "0123456789abcdef0123456789abcdef";

test("a valid room path reaches the Room", async () => {
  const response = await exports.default.fetch(`https://handit.test/ws/${ROOM_ID}`);
  expect(response.status).toBe(501);
});

test.each([
  "/ws/",
  "/ws/0123456789ABCDEF0123456789ABCDEF", // upper case
  "/ws/0123456789abcdef0123456789abcde", // 31 characters
  `/ws/${ROOM_ID}0`, // 33 characters
  `/ws/${ROOM_ID}/extra`,
  "/anything-else",
])("%s is refused", async (path) => {
  const response = await exports.default.fetch(`https://handit.test${path}`);
  expect(response.status).toBe(404);
});
