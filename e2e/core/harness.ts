// Drives the real core modules (loaded from the Vite dev server) inside test pages.
import type { Page } from "@playwright/test";
import { roomOrigin } from "../../playwright.config";

type Scope = Record<string, unknown>;

/** Owner: makes a new code, joins its Room and waits for a guest. Returns the link. */
export function openAsOwner(page: Page, mode: 1 | 2): Promise<string> {
  return page.evaluate(
    async ({ room, mode }) => {
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
      const scope = window as unknown as Scope;
      scope.connection = introduce({
        signal,
        role: "owner",
        me: { name: "Owner laptop", ua: "Chrome on Mac" },
        mode,
        onJoined: (peer: { name: string }) => {
          scope.joined = peer.name;
        },
      });
      return encodeLink(room, { mode, expiresAt: Math.floor(Date.now() / 1000) + 120, secret });
    },
    { room: roomOrigin, mode },
  );
}

/** Guest: opens the link's Room and introduces itself. */
export function openAsGuest(page: Page, link: string): Promise<void> {
  return page.evaluate(
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
      (window as unknown as Scope).connection = introduce({
        signal,
        role: "guest",
        me: { name: "Guest phone", ua: "Chrome on Android" },
        mode: parsed.link.mode,
      });
    },
    { link, room: roomOrigin },
  );
}
