import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HanditError } from "../src/core/codes";
import { checkSdp, introduce } from "../src/core/rtc";
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

const FP =
  "A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90";
const sdp = (...lines: string[]) =>
  ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", ...lines].join("\r\n");
const DATA = "m=application 9 UDP/DTLS/SCTP webrtc-datachannel";

describe("a description from the other device is checked before the browser sees it (S1)", () => {
  test("a data-channel description with one SHA-256 fingerprint is accepted", () => {
    expect(() =>
      checkSdp(sdp(DATA, `a=fingerprint:sha-256 ${FP}`, "a=setup:actpass")),
    ).not.toThrow();
  });
  test("the same fingerprint twice is fine", () => {
    expect(() =>
      checkSdp(sdp(DATA, `a=fingerprint:sha-256 ${FP}`, `a=fingerprint:sha-256 ${FP}`)),
    ).not.toThrow();
  });
  test.each([
    ["no fingerprint", sdp(DATA, "a=setup:actpass")],
    ["only a SHA-1 fingerprint", sdp(DATA, `a=fingerprint:sha-1 ${FP.slice(0, 59)}`)],
    [
      "two different SHA-256 fingerprints",
      sdp(DATA, `a=fingerprint:sha-256 ${FP}`, `a=fingerprint:sha-256 ${FP.replace("A1", "FF")}`),
    ],
    [
      "an audio section",
      sdp(DATA, "m=audio 9 UDP/TLS/RTP/SAVPF 111", `a=fingerprint:sha-256 ${FP}`),
    ],
    ["a video section", sdp("m=video 9 UDP/TLS/RTP/SAVPF 96", `a=fingerprint:sha-256 ${FP}`)],
    ["no data section", sdp(`a=fingerprint:sha-256 ${FP}`)],
    ["a fingerprint that isn't hex", sdp(DATA, "a=fingerprint:sha-256 not-a-fingerprint")],
  ])("%s is refused", (_, text) => {
    expect(() => checkSdp(text)).toThrow(/protocol error/);
  });

  test("the guest refuses a hostile offer instead of handing it to the browser", async () => {
    const { signal } = fakeSignal();
    const connection = introduce({ signal, role: "guest", me: device, mode: 1 });
    signal.onmessage({ t: "welcome", v: 1, name: "Mac", ua: "Safari on Mac", mode: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.onmessage({
      t: "sdp",
      type: "offer",
      sdp: sdp(DATA, "m=audio 9 RTP/AVP 0", `a=fingerprint:sha-256 ${FP}`),
    });
    await expect(connection).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
      details: "protocol error",
    });
  });
});

describe("a finished introduction isn't undone by the Room closing (S5)", () => {
  test("after the other device said bye, 'Peer left' no longer fails the connection", async () => {
    const { signal } = fakeSignal();
    const connection = introduce({ signal, role: "owner", me: device, mode: 1, timeoutMs: 150 });
    signal.onmessage({ t: "hello", v: 1, name: "Pixel", ua: "Chrome on Android" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.onmessage({ t: "bye" });
    signal.onfail(peerLeft);
    const early = await Promise.race([
      connection.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 40)),
    ]);
    expect(early).toBe("still waiting");
    await expect(connection).rejects.toMatchObject({ code: "P2P_FAILED" }); // the timer still guards it
  });
});
