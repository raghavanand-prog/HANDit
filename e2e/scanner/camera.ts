// A fake webcam for Chromium: a Y4M video of a QR code, written where
// --use-file-for-fake-video-capture points. Rewrite the file to show another code.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeQR } from "qr";

export const FAKE_CAMERA = join(tmpdir(), "handit-e2e", "fake-camera.y4m");
const W = 640;
const H = 480;

/** Writes a video (a few identical frames) showing `text` as a QR code on a white screen. */
export function showCode(text: string | null, path = FAKE_CAMERA) {
  mkdirSync(join(path, ".."), { recursive: true });
  const y = Buffer.alloc(W * H, 220); // a lit screen, a little grey like a real one
  if (text !== null) {
    const matrix = encodeQR(text, "raw", { ecc: "medium", border: 4 });
    const scale = Math.floor(420 / matrix.length);
    const size = matrix.length * scale;
    const left = Math.floor((W - size) / 2);
    const top = Math.floor((H - size) / 2);
    matrix.forEach((row, my) => {
      row.forEach((dark, mx) => {
        if (!dark) return;
        for (let dy = 0; dy < scale; dy++) {
          y.fill(
            20,
            (top + my * scale + dy) * W + left + mx * scale,
            (top + my * scale + dy) * W + left + (mx + 1) * scale,
          );
        }
      });
    });
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: 8 }, () => frame)]));
}
