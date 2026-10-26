import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HanditError } from "../src/core/codes";
import { introduce } from "../src/core/rtc";
import type { IntroMessage } from "../src/core/seal";
import type { Signal } from "../src/core/signal";

// The two browsers give up on a direct connection after the same time, but the guest starts its
// clock a little earlier. Whoever gives up first leaves the Room, which closes the other side's
// connection to it with "1000: Peer left". That must read as "couldn't connect directly", not
// as "can't reach the server".

class FakePeerConnection extends EventTarget {
  localDescription = { sdp: "v=0" };
  createDataChannel() {
    return Object.assign(new EventTarget(), { readyState: "connecting", binaryType: "" });
  }
  async setLocalDescription() {}
  close() {}
}

function fakeSignal() {
  const sent: IntroMessage[] = [];
  const signal: Signal = {
    ready: Promise.resolve(),
    onmessage: () => {},
    onfail: () => {},
    send: async (m) => void sent.push(m),
    close: () => {},
  };
  return { signal, sent };
}

const device = { name: "Mac", ua: "Safari on Mac" };
const peerLeft = new HanditError(
  "SERVER_UNREACHABLE",
  "Room closed the connection (1000: Peer left)",
);

beforeEach(() => {
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the other device gave up first", () => {
  test("the sender, after the guest joined, is told the devices couldn't connect directly", async () => {
    const { signal } = fakeSignal();
    const connection = introduce({ signal, role: "owner", me: device, mode: 1 });
    signal.onmessage({ t: "hello", v: 1, name: "Pixel", ua: "Chrome on Android" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.onfail(peerLeft);
    await expect(connection).rejects.toMatchObject({ code: "P2P_FAILED" });
  });

  test("the details still say what each side found", async () => {
    const { signal } = fakeSignal();
    const connection = introduce({ signal, role: "owner", me: device, mode: 1 });
    signal.onmessage({ t: "hello", v: 1, name: "Pixel", ua: "Chrome on Android" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.onfail(peerLeft);
    await expect(connection).rejects.toMatchObject({
      details: expect.stringContaining("Candidates found"),
    });
  });

  test("before anyone joined, the same close is still reported as it was", async () => {
    const { signal } = fakeSignal();
    const connection = introduce({ signal, role: "owner", me: device, mode: 1 });
    signal.onfail(peerLeft);
    await expect(connection).rejects.toMatchObject({ code: "SERVER_UNREACHABLE" });
  });

  test("a real loss of the server's connection (not 'Peer left') is still reported as such", async () => {
    const { signal } = fakeSignal();
    const connection = introduce({ signal, role: "owner", me: device, mode: 1 });
    signal.onmessage({ t: "hello", v: 1, name: "Pixel", ua: "Chrome on Android" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.onfail(new HanditError("SERVER_UNREACHABLE", "Room closed the connection (1006)"));
    await expect(connection).rejects.toMatchObject({ code: "SERVER_UNREACHABLE" });
  });
});
