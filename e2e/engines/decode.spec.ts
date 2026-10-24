import { expect, test } from "@playwright/test";

// Spike for the webcam scanner: does the QR decoder read a HANDit code in each major browser
// engine? Frames are drawn on a canvas the way a camera delivers them: scaled to a non-integer
// module size, softened by resampling, with sensor noise. A real camera is checked separately,
// in Chromium, with a fake camera device (see e2e/scanner).
test("the decoder reads a HANDit link from realistic frames", async ({ page, browserName }) => {
  await page.goto("/");
  const { required, hard } = await page.evaluate(async () => {
    const { encodeLink } = await import(`${"/src/core/"}link.ts`);
    const { decodeFrame, qrMatrix } = await import(`${"/src/core/"}scan.ts`);

    const draw = (
      matrix: boolean[][],
      scale: number,
      soften: number,
      noise: number,
      seed: number,
    ): ImageData => {
      const size = Math.round(matrix.length * scale);
      const source = document.createElement("canvas");
      source.width = matrix.length;
      source.height = matrix.length;
      const sctx = source.getContext("2d") as CanvasRenderingContext2D;
      const bits = sctx.createImageData(matrix.length, matrix.length);
      matrix.forEach((row: boolean[], y: number) => {
        row.forEach((dark: boolean, x: number) => {
          const v = dark ? 20 : 235;
          bits.data.set([v, v, v, 255], (y * matrix.length + x) * 4);
        });
      });
      sctx.putImageData(bits, 0, 0);

      const frame = document.createElement("canvas");
      frame.width = 640;
      frame.height = 480;
      const ctx = frame.getContext("2d") as CanvasRenderingContext2D;
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(0, 0, 640, 480);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const x = Math.round((640 - size) / 2);
      const y = Math.round((480 - size) / 2);
      if (soften < 1) {
        const tiny = document.createElement("canvas");
        tiny.width = Math.max(8, Math.round(size * soften));
        tiny.height = tiny.width;
        (tiny.getContext("2d") as CanvasRenderingContext2D).drawImage(
          source,
          0,
          0,
          tiny.width,
          tiny.height,
        );
        ctx.drawImage(tiny, x, y, size, size);
      } else {
        ctx.imageSmoothingEnabled = scale % 1 !== 0;
        ctx.drawImage(source, x, y, size, size);
      }
      const image = ctx.getImageData(0, 0, 640, 480);
      let state = seed;
      for (let i = 0; noise && i < image.data.length; i += 4) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const delta = ((state >>> 16) % (noise * 2 + 1)) - noise;
        for (let c = 0; c < 3; c++) {
          image.data[i + c] = Math.max(0, Math.min(255, (image.data[i + c] ?? 0) + delta));
        }
      }
      return image;
    };

    const linkFor = (n: number) =>
      encodeLink("https://handit.handit-worker.workers.dev", {
        mode: 2,
        expiresAt: 1_900_000_000,
        secret: Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + n * 11 + 5) & 0xff),
      });
    const readRate = (
      count: number,
      first: number,
      scale: number,
      soften: number,
      noise: number,
    ) => {
      let read = 0;
      for (let n = first; n < first + count; n++) {
        const link = linkFor(n);
        if (decodeFrame(draw(qrMatrix(link), scale, soften, noise, 12345 + n)) === link) read++;
      }
      return read;
    };

    const required: Record<string, number> = {
      "clean, 6 px modules": readRate(10, 0, 6, 1, 0),
      "non-integer 3.3 px modules": readRate(10, 0, 3.3, 1, 0),
      "softened (resampled down and up)": readRate(10, 0, 5, 0.5, 0),
      noisy: readRate(10, 0, 4, 1, 40),
    };
    // Informational: tiny, soft, noisy modules, over 20 different codes.
    return { required, hard: readRate(20, 100, 2.6, 0.7, 12) };
  });
  console.log(`${browserName}: ${JSON.stringify(required)}; hardest case read ${hard}/20`);
  for (const [label, read] of Object.entries(required)) {
    expect(read, `${browserName}: ${label} (read out of 10 codes)`).toBe(10);
  }
});
