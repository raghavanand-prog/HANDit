import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { openAsGuest, openAsOwner } from "../core/harness";

const MiB = 1024 * 1024;

/** The root of a file as the protocol defines it, computed here in Node, independently of the page. */
async function rootOf(path: string, size: number) {
  const digests: Buffer[] = [];
  for await (const block of createReadStream(path, { highWaterMark: MiB })) {
    digests.push(
      createHash("sha256")
        .update(block as Buffer)
        .digest(),
    );
  }
  const header = Buffer.alloc(12);
  header.writeBigUInt64BE(BigInt(size));
  header.writeUInt32BE(MiB, 8);
  return createHash("sha256")
    .update(Buffer.concat([header, ...digests]))
    .digest("hex");
}

/** Writes `count` files of `size` bytes of fast pseudo-random data into `dir`. */
async function makeFiles(dir: string, count: number, size: number, prefix = "IMG_") {
  await mkdir(dir, { recursive: true });
  const names: string[] = [];
  const chunk = Buffer.alloc(Math.min(size, 8 * MiB));
  let x = 0x9e3779b9;
  for (let n = 0; n < count; n++) {
    for (let o = 0; o + 4 <= chunk.length; o += 4) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      chunk.writeUInt32LE(x >>> 0, o);
    }
    const name = `${prefix}${String(n).padStart(5, "0")}.bin`;
    const file = await open(join(dir, name), "w");
    for (let written = 0; written < size; written += chunk.length) {
      await file.write(chunk, 0, Math.min(chunk.length, size - written));
    }
    await file.close();
    names.push(name);
  }
  return names;
}

/** Sends `paths` from one browser to another through the real Room; returns what the recipient saw. */
async function transfer(dir: string, names: string[], sizes: number[], label: string) {
  const browser = await chromium.launch({
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
  });
  const recipient = await chromium.launchPersistentContext(join(dir, "profile"), {
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
  });
  try {
    const sender = await (await browser.newContext()).newPage();
    const receiver = await recipient.newPage();
    await Promise.all([sender.goto("/"), receiver.goto("/")]);
    await sender.evaluate(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.id = "pick";
      document.body.append(input);
    });
    await sender.setInputFiles(
      "#pick",
      names.map((n) => join(dir, "src", n)),
    );
    await openAsGuest(receiver, await openAsOwner(sender, 1));

    // Page responsiveness: the longest gap between animation frames while the transfer runs.
    const watch = () => {
      const w = window as unknown as { __maxGap: number };
      w.__maxGap = 0;
      let last = performance.now();
      const tick = (t: number) => {
        w.__maxGap = Math.max(w.__maxGap, t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    await Promise.all([sender.evaluate(watch), receiver.evaluate(watch)]);

    const sent = sender.evaluate(async () => {
      const { Sender } = await import(`${"/src/core/"}transfer.ts`);
      const { Store, fileSource } = await import(`${"/src/core/"}files.ts`);
      const c = await (window as unknown as { connection: Promise<{ channel: RTCDataChannel }> })
        .connection;
      const picked = [...((document.getElementById("pick") as HTMLInputElement).files ?? [])];
      const items = picked.map((f, i) => ({
        i,
        path: `set/${f.name}`,
        size: f.size,
        kind: "file",
        type: "",
      }));
      const files = new Map(picked.map((f, i) => [i, f]));
      const state = await new Sender(c.channel, items, fileSource(new Store(), files)).run();
      return {
        phase: state.phase,
        error: state.error?.code,
        ok: Object.values(state.outcomes).filter((o) => (o as { ok: boolean }).ok).length,
      };
    });
    const received = await receiver.evaluate(async () => {
      const { Receiver } = await import(`${"/src/core/"}transfer.ts`);
      const { Store, opfsSink } = await import(`${"/src/core/"}files.ts`);
      const c = await (window as unknown as { connection: Promise<{ channel: RTCDataChannel }> })
        .connection;
      const store = new Store();
      const sink = opfsSink(store);
      const roots: string[] = [];
      const end = sink.end;
      sink.end = async () => {
        const result = await end();
        roots.push(result.root);
        return result;
      };
      const receiver = new Receiver(c.channel, sink);
      receiver.onchange = (s: { phase: string }) => {
        if (s.phase === "deciding") receiver.accept();
      };
      const started = performance.now();
      const state = await receiver.run();
      const seconds = (performance.now() - started) / 1000;
      await store.cleanup();
      return {
        phase: state.phase,
        error: state.error?.code,
        bytes: state.bytes,
        files: state.totalFiles,
        roots,
        seconds,
      };
    });
    const gaps = await Promise.all(
      [sender, receiver].map((p) =>
        p.evaluate(() => (window as unknown as { __maxGap: number }).__maxGap),
      ),
    );
    const result = await sent;
    const mb = received.bytes / MiB;
    console.log(
      `BENCH ${label}: ${received.files} files, ${mb.toFixed(0)} MiB in ${received.seconds.toFixed(1)} s = ${(mb / received.seconds).toFixed(1)} MiB/s; ` +
        `longest frame gap: sender ${Math.round(gaps[0] ?? 0)} ms, receiver ${Math.round(gaps[1] ?? 0)} ms`,
    );
    return { result, received, gaps, sizes };
  } finally {
    await recipient.close();
    await browser.close();
  }
}

test("OQ8: 1,000 photos (about 5 GB), laptop to laptop, all identical", async () => {
  const dir = await mkdtemp(join(tmpdir(), "handit-oq8-"));
  try {
    const sizes = new Array<number>(1000).fill(5 * MiB);
    const names = await makeFiles(join(dir, "src"), 1000, 5 * MiB);
    const expected = await Promise.all(
      names.map((n, i) => rootOf(join(dir, "src", n), sizes[i] ?? 0)),
    );
    const { result, received } = await transfer(dir, names, sizes, "OQ8 1,000 x 5 MiB");
    expect(result).toMatchObject({ phase: "complete", ok: 1000 });
    expect(received.phase).toBe("complete");
    expect(received.roots).toEqual(expected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("E3: 10,000 small files, all verified, and the page stays responsive", async () => {
  const dir = await mkdtemp(join(tmpdir(), "handit-e3-"));
  try {
    await mkdir(join(dir, "src"), { recursive: true });
    const names: string[] = [];
    for (let n = 0; n < 10_000; n++) {
      const name = `note-${String(n).padStart(5, "0")}.txt`;
      await writeFile(join(dir, "src", name), n === 0 ? "" : `file ${n} ${"x".repeat(n % 700)}`);
      names.push(name);
    }
    const { result, received, gaps } = await transfer(dir, names, [], "E3 10,000 small files");
    expect(result).toMatchObject({ phase: "complete", ok: 10_000 });
    expect(received.roots).toHaveLength(10_000);
    expect(Math.max(...gaps)).toBeLessThan(1000); // no frozen page: no frame took a full second
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("E4: 10,001 items are refused before anything is sent", async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), "handit-e4-"));
  try {
    await mkdir(join(dir, "src"), { recursive: true });
    const paths: string[] = [];
    for (let n = 0; n < 10_001; n++) {
      const path = join(dir, "src", `f${n}.txt`);
      await writeFile(path, "x");
      paths.push(path);
    }
    await page.goto("http://localhost:8787/send");
    await page.getByTestId("pick-files").setInputFiles(paths);
    await expect(
      page.getByText("This transfer has more than 10,000 items. Send it in parts."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Show code" })).toBeDisabled();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("E2: a file larger than 4 GB goes through on desktop Chrome, identical", async () => {
  test.skip(!process.env.BENCH_BIG, "set BENCH_BIG=1 to run the 4.5 GiB case");
  const dir = await mkdtemp(join(tmpdir(), "handit-e2-"));
  try {
    const size = 4.5 * 1024 * MiB;
    const names = await makeFiles(join(dir, "src"), 1, size, "BIG_");
    const expected = await rootOf(join(dir, "src", names[0] ?? ""), size);
    const { result, received } = await transfer(dir, names, [size], "E2 one 4.5 GiB file");
    expect(result).toMatchObject({ phase: "complete", ok: 1 });
    expect(received.roots).toEqual([expected]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
