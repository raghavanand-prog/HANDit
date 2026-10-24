import { expect, test } from "@playwright/test";
import { openAsGuest, openAsOwner } from "./harness";

type Connection = { channel: RTCDataChannel; pc: RTCPeerConnection; peer: { name: string } };

// Two separate browser contexts (like two devices) introduce themselves through the
// Room and open a direct WebRTC data channel, using the real core modules.
test("two browsers open a direct data channel through the Room", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await Promise.all([owner.goto("/"), guest.goto("/")]);

  await openAsGuest(guest, await openAsOwner(owner, 1));

  const ownerSide = owner.evaluate(async () => {
    const c = await (window as unknown as { connection: Promise<Connection> }).connection;
    const message = await new Promise<string>((resolve) => {
      c.channel.onmessage = (e) => resolve(e.data);
    });
    c.channel.send(`owner got: ${message}`);
    return { peer: c.peer.name, state: c.pc.connectionState, message };
  });
  const guestSide = await guest.evaluate(async () => {
    const c = await (window as unknown as { connection: Promise<Connection> }).connection;
    const reply = new Promise((resolve) => {
      c.channel.onmessage = (e) => resolve(e.data);
    });
    c.channel.send("hello over the direct channel");
    const candidates: string[] = [];
    (await c.pc.getStats()).forEach((report: { type: string; candidateType?: string }) => {
      if (report.type === "local-candidate" && report.candidateType) {
        candidates.push(report.candidateType);
      }
    });
    return { peer: c.peer.name, reply: await reply, candidates };
  });

  expect(await owner.evaluate(() => (window as unknown as { joined: string }).joined)).toBe(
    "Guest phone",
  );
  expect(await ownerSide).toEqual({
    peer: "Guest phone",
    state: "connected",
    message: "hello over the direct channel",
  });
  expect(guestSide.peer).toBe("Owner laptop");
  expect(guestSide.reply).toBe("owner got: hello over the direct channel");
  expect(guestSide.candidates).not.toContain("relay"); // direct only, no relay
});
