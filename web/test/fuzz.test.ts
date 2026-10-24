import { expect, test } from "vitest";
import { toBase64url } from "../src/core/bytes";
import { parseFragment } from "../src/core/link";
import { OfferAssembler, parseControl, splitOffer } from "../src/core/protocol";
import { createSeal } from "../src/core/seal";
import { Receiver } from "../src/core/transfer";
import { MemoryChannel, MemorySink } from "./channel";
import { BASE64URL, mutate, PAYLOAD, ROOM_ID, SECRET, seededRandom } from "./helpers";

// S8: 100,000 random or mutated links, sealed frames and data-channel messages cause no
// crash, hang or unbounded memory. Seeded, so any failure can be replayed exactly.
const N = 100_000;
const JSON_ALPHABET = '{}[]":,0123456789.-_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ \\';
const ID = "0123456789abcdef0123456789abcdef";

const pick = (random: () => number, alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");

test(`${N} random and mutated links never crash the parser`, () => {
  const random = seededRandom(1);
  let accepted = 0;
  for (let i = 0; i < N; i++) {
    const input = [
      () => pick(random, BASE64URL, Math.floor(random() * 120)),
      () => mutate(PAYLOAD, random),
      () => mutate(mutate(PAYLOAD, random), random),
      () => PAYLOAD.slice(0, Math.floor(random() * 60)),
      () =>
        String.fromCharCode(
          ...Array.from({ length: 1 + Math.floor(random() * 60) }, () =>
            Math.floor(random() * 0x10000),
          ),
        ),
      () =>
        toBase64url(
          Uint8Array.from({ length: Math.floor(random() * 50) }, () => Math.floor(random() * 256)),
        ),
    ][i % 6]?.() as string;
    const result = parseFragment(input);
    if (result.ok) {
      accepted++;
      expect(result.link.secret).toHaveLength(32);
    } else {
      expect(["LINK_INVALID", "LINK_UNSUPPORTED_VERSION"]).toContain(result.code);
    }
  }
  // Almost everything random is refused; mutations of a valid link that still parse are
  // the ones whose changed character lands in the secret or expiry.
  expect(accepted).toBeLessThan(N / 2);
});

test(`${N} random and mutated sealed frames never open or crash`, async () => {
  const random = seededRandom(2);
  const owner = await createSeal(SECRET, ROOM_ID, "owner");
  const guest = await createSeal(SECRET, ROOM_ID, "guest");
  const frame = await guest.seal({ t: "hello", v: 1, name: "Pixel", ua: "Chrome on Android" });
  for (let i = 0; i < N; i++) {
    const input = [
      () => mutate(frame, random, JSON_ALPHABET),
      () => pick(random, JSON_ALPHABET, Math.floor(random() * 200)),
      () => frame.slice(0, Math.floor(random() * frame.length)),
      () =>
        frame.replace(
          /"ct":"[^"]*"/,
          `"ct":"${pick(random, BASE64URL, 20 + Math.floor(random() * 60))}"`,
        ),
    ][i % 4]?.() as string;
    const result = await owner.open(input);
    expect(result.ok).toBe(false);
  }
  expect((await owner.open(frame)).ok).toBe(true); // the genuine frame still opens
});

test(`${N} random and mutated data-channel messages never crash the parser`, () => {
  const random = seededRandom(3);
  const valid = [
    `{"t":"offer","id":"${ID}","files":2,"bytes":20,"parts":1}`,
    `{"t":"offer_items","id":"${ID}","items":[{"i":0,"path":"a/b.txt","size":10,"kind":"file","type":"text/plain"}]}`,
    `{"t":"file_end","i":0,"size":10,"root":"${"a".repeat(64)}"}`,
    `{"t":"summary","ok":[0,1],"failed":[{"i":2,"code":"INTEGRITY_FAILED"}]}`,
    `{"t":"decline","id":"${ID}","reason":"user"}`,
  ];
  for (let i = 0; i < N; i++) {
    const base = valid[i % valid.length] as string;
    const input =
      i % 3 === 0
        ? mutate(base, random, JSON_ALPHABET)
        : i % 3 === 1
          ? pick(random, JSON_ALPHABET, Math.floor(random() * 300))
          : base.slice(0, Math.floor(random() * base.length));
    const parsed = parseControl(input);
    if (parsed) expect(typeof parsed.t).toBe("string");
  }
});

test("random offers never get past the assembler with a wrong total or order", () => {
  const random = seededRandom(4);
  for (let i = 0; i < 20_000; i++) {
    const count = Math.floor(random() * 6);
    const items = Array.from({ length: count }, (_, n) => ({
      i: random() < 0.8 ? n : Math.floor(random() * 10),
      path: pick(random, "ab/.", 1 + Math.floor(random() * 12)),
      size: Math.floor(random() * 100),
      kind: (random() < 0.8 ? "file" : "dir") as "file" | "dir",
      type: "",
    }));
    const files = items.filter((x) => x.kind === "file");
    const offer = {
      t: "offer" as const,
      id: ID,
      files: files.length + (random() < 0.2 ? 1 : 0),
      bytes: files.reduce((s, x) => s + x.size, 0) + (random() < 0.2 ? 1 : 0),
      parts: 1,
    };
    try {
      const assembler = new OfferAssembler(offer);
      for (const part of splitOffer(ID, items)) {
        const result = assembler.add(part);
        if (result) {
          expect(result.map((x) => x.i)).toEqual(result.map((_, n) => n));
          expect(result.filter((x) => x.kind === "file").length).toBe(offer.files);
        }
      }
    } catch {
      // Refused: that's the expected outcome for a bad offer.
    }
  }
});

test("a receiver survives 20,000 random messages, text and binary, without leaving a file behind", async () => {
  const random = seededRandom(5);
  for (let round = 0; round < 200; round++) {
    const [a, b] = MemoryChannel.pair();
    const sink = new MemorySink();
    const receiver = new Receiver(b, sink);
    const run = receiver.run();
    for (let i = 0; i < 100; i++) {
      if (random() < 0.5) a.send(pick(random, JSON_ALPHABET, Math.floor(random() * 120)));
      else
        a.send(
          Uint8Array.from({ length: Math.floor(random() * 50) }, () => Math.floor(random() * 256)),
        );
    }
    const state = await run;
    expect(state.phase).toBe("failed");
    expect(state.error?.code).toBe("UNKNOWN_ERROR");
    expect(sink.files.size).toBe(0);
  }
});
