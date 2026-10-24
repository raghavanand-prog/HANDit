import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openAsGuest, openAsOwner } from "./harness";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

// [path the sender claims, path the recipient must save it under]
const FILES: [string, string, Buffer][] = [
  ["Holiday/Day 1/IMG_0042.HEIC", "Holiday/Day 1/IMG_0042.HEIC", randomBytes(5 * 1024 * 1024)],
  ["Holiday/Day 1/img_0042.heic", "Holiday/Day 1/img_0042 (1).heic", randomBytes(1000)],
  ["Holiday/notes:draft?.txt", "Holiday/notes_draft_.txt", Buffer.from("notes")],
  ["Holiday/CON.txt", "Holiday/_CON.txt", Buffer.from("reserved name")],
  ["invoice‮gpj.exe", "invoicegpj.exe", Buffer.from("MZ")],
  ["école ಕನ್ನಡ 😀.txt", "école ಕನ್ನಡ 😀.txt", Buffer.from("unicode")],
  ["empty.bin", "empty.bin", Buffer.alloc(0)],
];

test("received files save as a ZIP whose contents are identical to the originals", async ({
  browser,
}, testInfo) => {
  const sender = await (await browser.newContext()).newPage();
  const receiver = await (await browser.newContext({ acceptDownloads: true })).newPage();
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
    FILES.map(([, , buffer], n) => ({
      name: `f${n}`,
      mimeType: "application/octet-stream",
      buffer,
    })),
  );
  await openAsGuest(receiver, await openAsOwner(sender, 1));

  const paths = FILES.map(([claimed]) => claimed);
  const sent = sender.evaluate(async (paths) => {
    const { Sender } = await import(`${"/src/core/"}transfer.ts`);
    const { Store, fileSource } = await import(`${"/src/core/"}files.ts`);
    const c = await (window as unknown as { connection: Promise<{ channel: RTCDataChannel }> })
      .connection;
    const picked = [...((document.getElementById("pick") as HTMLInputElement).files ?? [])];
    const items = paths.map((path, i) => ({
      i,
      path,
      size: picked[i]?.size ?? 0,
      kind: "file",
      type: "",
    }));
    items.push({ i: items.length, path: "Holiday/Empty folder", size: 0, kind: "dir", type: "" });
    const files = new Map(picked.map((file, i) => [i, file]));
    return (await new Sender(c.channel, items, fileSource(new Store(), files)).run()).phase;
  }, paths);

  const downloadPromise = receiver.waitForEvent("download");
  const received = await receiver.evaluate(async () => {
    const core = "/src/core/";
    const { Receiver } = await import(`${core}transfer.ts`);
    const { Store, opfsSink } = await import(`${core}files.ts`);
    const save = await import(`${core}save.ts`);
    const c = await (window as unknown as { connection: Promise<{ channel: RTCDataChannel }> })
      .connection;
    const sink = opfsSink(new Store());
    const receiver = new Receiver(c.channel, sink);
    receiver.onchange = (s: { phase: string }) => {
      if (s.phase === "deciding") receiver.accept();
    };
    const state = await receiver.run();
    const ok = Object.entries(state.outcomes)
      .filter(([, o]) => (o as { ok: boolean }).ok)
      .map(([i]) => Number(i));
    const files = await save.openReceived(state.id, state.items, ok, sink.crcs);
    const folders = state.items.filter((x: { kind: string }) => x.kind === "dir");
    save.download(save.zipOf(files, folders), save.zipName(state.items));
    return { phase: state.phase, paths: state.items.map((x: { path: string }) => x.path) };
  });

  expect(await sent).toBe("complete");
  expect(received.phase).toBe("complete");
  expect(received.paths).toEqual([...FILES.map(([, safe]) => safe), "Holiday/Empty folder"]);

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("HANDit files.zip");
  const zipPath = testInfo.outputPath("received.zip");
  await download.saveAs(zipPath);
  const script = `
import hashlib, json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({i.filename: [hashlib.sha256(z.read(i)).hexdigest(), i.compress_type] for i in z.infolist()}))`;
  const unzipped = JSON.parse(execFileSync("python3", ["-I", "-c", script, zipPath]).toString());

  for (const [, safe, buffer] of FILES) expect(unzipped[safe]).toEqual([sha256(buffer), 0]);
  expect(unzipped["Holiday/Empty folder/"]).toBeDefined();
  expect(readFileSync(zipPath).length).toBeGreaterThan(5 * 1024 * 1024);
});
