// The direct connection. The owner and guest introduce themselves through the
// Room (sealed), exchange WebRTC offer/answer and ICE candidates (sealed), and
// end up with a DTLS-encrypted data channel straight between the two browsers.
// Each side's DTLS fingerprint is inside its sealed SDP, so nobody in between
// can substitute their own.
import { HanditError, toHanditError } from "./codes";
import type { Mode } from "./link";
import { cleanPeerText } from "./names";
import type { IntroMessage, Role } from "./seal";
import type { Signal } from "./signal";

export const PROTOCOL_VERSION = 1;
export const CONNECT_TIMEOUT_MS = 20_000;
export const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export interface Device {
  name: string;
  /** Browser and system label, such as "Safari on iPhone". */
  ua: string;
}

export interface Connection {
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  peer: Device;
  mode: Mode;
}

export interface IntroduceOptions {
  signal: Signal;
  role: Role;
  me: Device;
  /** The owner's mode, or the mode the guest's link says. */
  mode: Mode;
  /** Owner: called when a guest proves it saw the code (its hello opened). */
  onJoined?: (peer: Device) => void;
  rtcConfig?: RTCConfiguration;
  timeoutMs?: number;
}

const protocolError = () => new HanditError("UNKNOWN_ERROR", "protocol error");

/** Candidate kinds, in plain words, for the P2P_FAILED details. */
const kindOf = (candidate: string) => {
  const type = candidate.match(/ typ (\w+)/)?.[1];
  return type === "host" ? "local" : type === "relay" ? "relay" : type ? "public" : "unknown";
};

export function introduce({
  signal,
  role,
  me,
  mode,
  onJoined,
  rtcConfig = { iceServers: ICE_SERVERS },
  timeoutMs = CONNECT_TIMEOUT_MS,
}: IntroduceOptions): Promise<Connection> {
  return new Promise((resolve, reject) => {
    let pc: RTCPeerConnection | undefined;
    let peer: Device | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let remoteDescriptionSet = false;
    const early: RTCIceCandidateInit[] = [];
    const localKinds = new Set<string>();
    const remoteKinds = new Set<string>();

    const details = () => {
      const list = (kinds: Set<string>) => (kinds.size ? [...kinds].join(", ") : "none");
      return `Candidates found — this device: ${list(localKinds)}; other device: ${list(remoteKinds)}`;
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pc?.close();
      signal.close();
      reject(toHanditError(error));
    };
    const startTimer = () => {
      timer = setTimeout(() => fail(new HanditError("P2P_FAILED", details())), timeoutMs);
    };

    const createPeerConnection = () => {
      const connection = new RTCPeerConnection(rtcConfig);
      connection.addEventListener("icecandidate", ({ candidate }) => {
        if (!candidate?.candidate) return;
        localKinds.add(kindOf(candidate.candidate));
        void signal.send({
          t: "ice",
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        });
      });
      connection.addEventListener("connectionstatechange", () => {
        if (connection.connectionState === "failed") fail(new HanditError("P2P_FAILED", details()));
      });
      pc = connection;
      return connection;
    };

    const whenOpen = (channel: RTCDataChannel) => {
      channel.binaryType = "arraybuffer";
      const finish = () => {
        if (settled || !pc || !peer) return;
        settled = true;
        clearTimeout(timer);
        // Both sides say bye and leave the Room; it then deletes everything.
        void signal.send({ t: "bye" }).finally(() => signal.close());
        resolve({ pc, channel, peer, mode });
      };
      if (channel.readyState === "open") finish();
      else channel.addEventListener("open", finish, { once: true });
    };

    const handle = async (m: IntroMessage) => {
      if (!peer) {
        if (role === "owner" ? m.t !== "hello" : m.t !== "welcome") throw protocolError();
        if (m.t !== "hello" && m.t !== "welcome") throw protocolError();
        if (m.v !== PROTOCOL_VERSION) throw new HanditError("LINK_UNSUPPORTED_VERSION");
        if (m.t === "welcome" && m.mode !== mode) throw protocolError();
        // Shown in the prompts: cut short and cleaned, so a hostile name can't fill the screen or hide in it.
        peer = { name: cleanPeerText(m.name, 40), ua: cleanPeerText(m.ua, 40) };

        if (role === "owner") {
          onJoined?.(peer);
          await signal.send({ t: "welcome", v: PROTOCOL_VERSION, name: me.name, ua: me.ua, mode });
          const connection = createPeerConnection();
          startTimer();
          whenOpen(connection.createDataChannel("handit", { ordered: true }));
          await connection.setLocalDescription();
          const sdp = connection.localDescription?.sdp;
          if (!sdp) throw protocolError();
          await signal.send({ t: "sdp", type: "offer", sdp });
        } else {
          const connection = createPeerConnection();
          connection.addEventListener("datachannel", ({ channel }) => {
            if (channel.label === "handit") whenOpen(channel);
          });
        }
        return;
      }
      if (!pc) throw protocolError();

      if (m.t === "sdp") {
        if (m.type !== (role === "owner" ? "answer" : "offer") || remoteDescriptionSet) {
          throw protocolError();
        }
        await pc.setRemoteDescription({ type: m.type, sdp: m.sdp });
        remoteDescriptionSet = true;
        for (const candidate of early.splice(0)) await pc.addIceCandidate(candidate);
        if (m.type === "offer") {
          await pc.setLocalDescription();
          const sdp = pc.localDescription?.sdp;
          if (!sdp) throw protocolError();
          await signal.send({ t: "sdp", type: "answer", sdp });
        }
      } else if (m.t === "ice") {
        remoteKinds.add(kindOf(m.candidate));
        if (remoteDescriptionSet) await pc.addIceCandidate(m);
        else early.push(m);
      } else if (m.t !== "bye") {
        throw protocolError();
      }
    };

    // Handle messages strictly one at a time, in arrival order.
    let queue = Promise.resolve();
    signal.onmessage = (m) => {
      queue = queue.then(() => (settled ? undefined : handle(m))).catch(fail);
    };
    // Both devices give up after the same time, one a moment before the other. The one that gives
    // up leaves the Room, which closes the other's connection with "Peer left". Once the two have
    // met, that is the connection having failed, not the server being unreachable.
    signal.onfail = (error) =>
      fail(
        peer && error instanceof HanditError && error.details.includes("1000: Peer left")
          ? new HanditError("P2P_FAILED", details())
          : error,
      );

    if (role === "guest") {
      signal.ready
        .then(() => {
          startTimer();
          return signal.send({ t: "hello", v: PROTOCOL_VERSION, name: me.name, ua: me.ua });
        })
        .catch(fail);
    }
  });
}
