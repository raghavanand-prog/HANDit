// Can this browser run HANDit? It needs WebRTC data channels, Web Crypto,
// the origin private file system and Web Workers, in a secure (HTTPS) context.
export function missingFeatures(): string[] {
  const missing: string[] = [];
  if (!globalThis.isSecureContext) missing.push("a secure (HTTPS) connection");
  if (
    typeof RTCPeerConnection !== "function" ||
    !("createDataChannel" in RTCPeerConnection.prototype)
  ) {
    missing.push("WebRTC data channels");
  }
  if (!globalThis.crypto?.subtle) missing.push("Web Crypto");
  if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") {
    missing.push("private storage (OPFS)");
  }
  if (typeof Worker !== "function") missing.push("Web Workers");
  return missing;
}
