import { expect, test } from "@playwright/test";
import { roomOrigin } from "../../playwright.config";

// Two separate browser contexts (like two devices) introduce themselves through the
// Room and open a direct WebRTC data channel, using the real core modules.
test("two browsers open a direct data channel through the Room", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await Promise.all([owner.goto("/"), guest.goto("/")]);

  const link = await owner.evaluate(async (room) => {
    const core = "/src/core/";
    const { encodeLink, newSecret, roomIdFor } = await import(`${core}link.ts`);
    const { createSeal } = await import(`${core}seal.ts`);
    const { openSignal, roomUrl } = await import(`${core}signal.ts`);
    const { introduce } = await import(`${core}rtc.ts`);

    const secret = newSecret();
    const roomId = await roomIdFor(secret);
    const signal = openSignal(
      roomUrl(room, roomId, "owner", 120),
      await createSeal(secret, roomId, "owner"),
    );
    await signal.ready;
    const state = window as unknown as Record<string, unknown>;
    state.result = introduce({
      signal,
      role: "owner",
      me: { name: "Owner laptop", ua: "Chrome on Mac" },
      mode: 1,
      onJoined: (peer: { name: string }) => {
        state.joined = peer.name;
      },
    }).then(
      (c: { channel: RTCDataChannel; peer: { name: string }; pc: RTCPeerConnection }) =>
        new Promise((resolve) => {
          c.channel.onmessage = (e) => {
            c.channel.send(`owner got: ${e.data}`);
            resolve({ peer: c.peer.name, connection: c.pc.connectionState });
          };
        }),
    );
    return encodeLink(room, { mode: 1, expiresAt: Math.floor(Date.now() / 1000) + 120, secret });
  }, roomOrigin);

  const guestResult = await guest.evaluate(
    async ({ link, room }) => {
      const core = "/src/core/";
      const { parseFragment, roomIdFor } = await import(`${core}link.ts`);
      const { createSeal } = await import(`${core}seal.ts`);
      const { openSignal, roomUrl } = await import(`${core}signal.ts`);
      const { introduce } = await import(`${core}rtc.ts`);

      const parsed = parseFragment(new URL(link).hash);
      if (!parsed.ok) throw new Error(parsed.code);
      const roomId = await roomIdFor(parsed.link.secret);
      const signal = openSignal(
        roomUrl(room, roomId, "guest"),
        await createSeal(parsed.link.secret, roomId, "guest"),
      );
      const c = await introduce({
        signal,
        role: "guest",
        me: { name: "Guest phone", ua: "Chrome on Android" },
        mode: parsed.link.mode,
      });
      const reply = new Promise((resolve) => {
        c.channel.onmessage = (e: MessageEvent) => resolve(e.data);
      });
      c.channel.send("hello over the direct channel");
      const candidates: string[] = [];
      (await c.pc.getStats()).forEach((report: { type: string; candidateType?: string }) => {
        if (report.type === "local-candidate" && report.candidateType) {
          candidates.push(report.candidateType);
        }
      });
      return { peer: c.peer.name, reply: await reply, candidates };
    },
    { link, room: roomOrigin },
  );

  const ownerResult = await owner.evaluate(() => (window as unknown as { result: unknown }).result);
  expect(await owner.evaluate(() => (window as unknown as { joined: string }).joined)).toBe(
    "Guest phone",
  );
  expect(ownerResult).toEqual({ peer: "Guest phone", connection: "connected" });
  expect(guestResult.peer).toBe("Owner laptop");
  expect(guestResult.reply).toBe("owner got: hello over the direct channel");
  expect(guestResult.candidates).not.toContain("relay"); // direct only, no relay
});
