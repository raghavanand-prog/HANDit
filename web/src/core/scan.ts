// Scanning a code with the in-page camera. The scanner reads a link from a camera frame; this
// module decides whether it is a code from this site, and decodes single frames for tests.
import { encodeQR } from "qr";
import decodeQR from "qr/decode.js";
import { type LinkResult, parseFragment } from "./link";

/** The code for a link, as rows of dark (true) and light modules, with the four-module quiet zone. */
export const qrMatrix = (text: string): boolean[][] =>
  encodeQR(text, "raw", { ecc: "medium", border: 4 });

/**
 * Turns scanned text into a join result, or null if it isn't a HANDit code from this site
 * (a Wi-Fi code, another site's link, a stray QR code): the scanner then keeps looking.
 * Our own link with a damaged or newer code gives a failed result, so the page can explain.
 */
export function linkFromScan(text: string, origin: string): LinkResult | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname !== "/j" || url.hash.length < 2) return null;
  return parseFragment(url.hash);
}

/** Decodes one camera frame; null if there's no readable code in it. */
export function decodeFrame(image: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): string | null {
  try {
    return decodeQR({ width: image.width, height: image.height, data: image.data });
  } catch {
    return null;
  }
}
