import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { openAsGuest, openAsOwner } from "./harness";

const MiB = 1024 * 1024;
const SIZE = Number(process.env.E2E_BIG_MB ?? 1024) * MiB;

/** Writes `size` bytes of fast, deterministic pseudo-random data. */
async function makeFile(path: string, size: number) {
  const file = await open(path, "w");
  const chunk = Buffer.alloc(16 * MiB);
  let x = 0x9e3779b9;
  for (let written = 0; written < size; written += chunk.length) {
    for (let o = 0; o < chunk.length; o += 4) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      chunk.writeUInt32LE(x >>> 0, o);
    }
    await file.write(chunk, 0, Math.min(chunk.length, size - written));
  }
  await file.close();
}

/** The file's root, computed independently of the page code. */
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

test("a 1 GiB file goes browser to browser and the roots match", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const dir = await mkdtemp(join(tmpdir(), "handit-e2e-"));
  const path = join(dir, "big.bin");
  await makeFile(path, SIZE);
  const expectedRoot = await rootOf(path, SIZE);

  // The recipient uses a normal (on-disk) profile, so OPFS has a real storage quota.
  const recipient = await chromium.launchPersistentContext(join(dir, "profile"), {
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
  });
  try {
    const sender = await (await browser.newContext()).newPage();
    const receiver = await recipient.newPage();
    await Promise.all([sender.goto("/"), receiver.goto("http://localhost:5173/")]);

    await sender.evaluate(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.id = "pick";
      document.body.append(input);
    });
    await sender.setInputFiles("#pick", path);
    await openAsGuest(receiver, await openAsOwner(sender, 1));

    const sent = sender.evaluate(async () => {
      const { Sender } = await import(`${"/src/core/"}transfer.ts`);
      const { Store, fileSource } = await import(`${"/src/core/"}files.ts`);
      const c = await (window as unknown as { connection: Promise<{ channel: RTCDataChannel }> })
        .connection;
      const file = (document.getElementById("pick") as HTMLInputElement).files?.[0] as File;
      const items = [{ i: 0, path: file.name, size: file.size, kind: "file", type: file.type }];
      const state = await new Sender(
        c.channel,
        items,
        fileSource(new Store(), new Map([[0, file]])),
      ).run();
      return { phase: state.phase, error: state.error?.code, outcomes: state.outcomes };
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
        roots,
        mbPerSecond: Math.round(state.bytes / 1024 / 1024 / seconds),
      };
    });

    expect(await sent).toEqual({ phase: "complete", outcomes: { 0: { ok: true } } });
    expect(received).toMatchObject({ phase: "complete", bytes: SIZE, roots: [expectedRoot] });
    console.log(`1 file, ${SIZE / MiB} MiB, ${received.mbPerSecond} MB/s, root ${expectedRoot}`);
  } finally {
    await recipient.close();
    await rm(dir, { recursive: true, force: true });
  }
});
