import { describe, expect, test } from "vitest";
import {
  cleanPeerText,
  isolate,
  makeSafe,
  riskOf,
  safeComponent,
  UnsafeOffer,
} from "../src/core/names";
import type { OfferItem } from "../src/core/protocol";
import { zipName } from "../src/core/save";

const files = (...paths: string[]): OfferItem[] =>
  paths.map((path, i) => ({ i, path, size: 1, kind: "file", type: "" }));
const safePaths = (...paths: string[]) => makeSafe(files(...paths)).map((x) => x.path);
const utf8Length = (s: string) => new TextEncoder().encode(s).length;
/** Characters that must never survive: reserved, control, invisible or bidirectional. */
const hasUnsafeCharacter = (name: string) =>
  [...name].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return (
      '<>:"/\\|?*'.includes(ch) ||
      c < 0x20 ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069) ||
      c === 0xfeff
    );
  });

// The hostile-name fixture: [name the sender claims, name HANDit uses].
const RENAMED: [string, string][] = [
  ["report.pdf", "report.pdf"],
  ["a<b>c.txt", "a_b_c.txt"],
  ['quote".txt', "quote_.txt"],
  ["pipe|name.txt", "pipe_name.txt"],
  ["what?.txt", "what_.txt"],
  ["star*.txt", "star_.txt"],
  ["colon:name.txt", "colon_name.txt"],
  ["back\\slash.txt", "back_slash.txt"],
  ['all<>:"\\|?*.txt', "all________.txt"],
  ["tab\tname.txt", "tab_name.txt"],
  ["new\nline.txt", "new_line.txt"],
  ["carriage\rreturn.txt", "carriage_return.txt"],
  ["bell\u0007.txt", "bell_.txt"],
  ["escape\u001b[31m.txt", "escape_[31m.txt"],
  ["del\u007f.txt", "del_.txt"],
  ["c1\u0085.txt", "c1_.txt"],
  ["csi\u009b.txt", "csi_.txt"],
  ["invoice\u202egpj.exe", "invoicegpj.exe"], // shows as "invoiceexe.jpg" with the override
  ["photo\u202dleft.jpg", "photoleft.jpg"],
  ["embed\u202aed.txt", "embeded.txt"],
  ["pop\u202c.txt", "pop.txt"],
  ["a\u200bb.txt", "ab.txt"], // zero-width space
  ["mark\u200e.txt", "mark.txt"], // left-to-right mark
  ["mark\u200f.txt", "mark.txt"], // right-to-left mark
  ["iso\u2066late\u2069.txt", "isolate.txt"],
  ["first\u2068strong.txt", "firststrong.txt"],
  ["\ufeffbom.txt", "bom.txt"],
  ["  spaced.txt  ", "spaced.txt"],
  ["trailing dots...", "trailing dots"],
  ["...", "_"],
  ["   ", "_"],
  ["\u200b", "_"],
  ["\u202e\u202d", "_"],
  ["CON", "_CON"],
  ["con.txt", "_con.txt"],
  ["Aux.tar.gz", "_Aux.tar.gz"],
  ["nul", "_nul"],
  ["PRN.log", "_PRN.log"],
  ["COM1.log", "_COM1.log"],
  ["com9", "_com9"],
  ["LPT1", "_LPT1"],
  ["lpt9.doc", "_lpt9.doc"],
  ["COM10.txt", "COM10.txt"],
  ["CONSOLE.txt", "CONSOLE.txt"],
  ["e\u0301cole.txt", "\u00e9cole.txt"], // NFD → NFC
  ["\u212bngstr\u00f6m.txt", "\u00c5ngstr\u00f6m.txt"], // Angstrom sign → Å
  [".hidden", ".hidden"],
  ["-rf", "-rf"],
  ["setup.exe ", "setup.exe"],
  ["😀 party.jpg", "😀 party.jpg"],
  ["ಕನ್ನಡ ದಾಖಲೆ.pdf", "ಕನ್ನಡ ದಾಖಲೆ.pdf"],
  ["हिंदी फ़ाइल.txt", "हिंदी फ़ाइल.txt".normalize("NFC")],
  ["a".repeat(300) + ".jpg", "a".repeat(251) + ".jpg"],
  ["é".repeat(200) + ".txt", "é".repeat(125) + ".txt"],
  ["😀".repeat(100), "😀".repeat(63)],
  ["a." + "b".repeat(300), "a." + "b".repeat(253)],
];

describe("safeComponent", () => {
  test(`the fixture has at least 60 hostile names (${RENAMED.length} renamed + rejected + collisions)`, () => {
    expect(RENAMED.length + REJECTED.length + COLLISIONS.length).toBeGreaterThanOrEqual(60);
  });

  test.each(RENAMED)("%j → %j", (input, expected) => {
    const safe = safeComponent(input);
    expect(safe).toBe(expected);
    expect(utf8Length(safe)).toBeLessThanOrEqual(255);
    expect(hasUnsafeCharacter(safe)).toBe(false);
  });
});

const REJECTED = [
  "/etc/passwd",
  "\\\\server\\share\\x.txt",
  "\\windows\\x.dll",
  "C:/Windows/x.dll",
  "c:evil.txt",
  "D:",
  "a//b.txt",
  "a/./b.txt",
  "./b.txt",
  "../escape.txt",
  "a/../../b.txt",
  "folder/..",
  "nul\u0000byte.txt",
  "a/b/",
  "",
];

describe("makeSafe rejects the whole offer", () => {
  test.each(REJECTED)("%j", (path) => {
    expect(() => makeSafe(files("fine.txt", path))).toThrow(UnsafeOffer);
  });
});

const COLLISIONS: [string[], string[]][] = [
  [
    ["a.txt", "A.TXT"],
    ["a.txt", "A (1).TXT"],
  ],
  [
    ["photo.jpg", "photo.jpg", "photo.jpg"],
    ["photo.jpg", "photo (1).jpg", "photo (2).jpg"],
  ],
  [
    ["a<b.txt", "a>b.txt", "a_b.txt"],
    ["a_b.txt", "a_b (1).txt", "a_b (2).txt"],
  ],
  [
    ["README", "readme"],
    ["README", "readme (1)"],
  ],
  [
    [".bashrc", ".BASHRC"],
    [".bashrc", ".BASHRC (1)"],
  ],
  [
    ["e\u0301.txt", "\u00e9.txt"],
    ["\u00e9.txt", "\u00e9 (1).txt"],
  ],
  [
    ["con.txt", "_con.txt"],
    ["_con.txt", "_con (1).txt"],
  ],
  [
    ["x/1.txt", "X/2.txt"],
    ["x/1.txt", "X (1)/2.txt"],
  ],
  [
    ["dir/a.txt", "dir/b.txt", "dir/sub/a.txt"],
    ["dir/a.txt", "dir/b.txt", "dir/sub/a.txt"],
  ],
  [
    ["a.txt", "b/a.txt"],
    ["a.txt", "b/a.txt"],
  ],
];

describe("collisions are resolved case-insensitively", () => {
  test.each(COLLISIONS)("%j → %j", (input, expected) => {
    expect(safePaths(...input)).toEqual(expected);
  });

  test("a long name keeps its ' (1)' within 255 bytes", () => {
    const long = `${"n".repeat(260)}.jpg`;
    const [first, second] = safePaths(long, long);
    expect(second).toBe(`${"n".repeat(247)} (1).jpg`);
    expect(utf8Length(second ?? "")).toBeLessThanOrEqual(255);
    expect(first).toBe(`${"n".repeat(251)}.jpg`);
  });

  test("folders and the files in them keep their place", () => {
    const items: OfferItem[] = [
      { i: 0, path: "Holiday", size: 0, kind: "dir", type: "" },
      { i: 1, path: "Holiday/a:b.jpg", size: 1, kind: "file", type: "image/jpeg" },
      { i: 2, path: "Holiday/empty", size: 0, kind: "dir", type: "" },
    ];
    expect(makeSafe(items)).toEqual([
      { i: 0, path: "Holiday", size: 0, kind: "dir", type: "" },
      { i: 1, path: "Holiday/a_b.jpg", size: 1, kind: "file", type: "image/jpeg" },
      { i: 2, path: "Holiday/empty", size: 0, kind: "dir", type: "" },
    ]);
  });
});

describe("apps, installers and scripts are flagged", () => {
  test.each([
    ["setup.exe", "app"],
    ["install.MSI", "app"],
    ["page.hta", "app"],
    ["library.dll", "app"],
    ["disk.iso", "app"],
    ["package.deb", "app"],
    ["tool.rpm", "app"],
    ["launch.jnlp", "app"],
    ["script.py", "app"],
    ["settings.reg", "app"],
    ["shortcut.url", "app"],
    ["run.sh", "app"],
    ["script.JS", "app"],
    ["Tool.app", "app"],
    ["shortcut.lnk", "app"],
    ["build.command", "app"],
    ["game.apk", "app"],
    ["invoice.pdf.exe", "disguised"],
    ["photo.jpg.scr", "disguised"],
    ["photo.jpg", null],
    ["archive.tar.gz", null],
    ["notes.txt", null],
    [".exe", null],
  ])("%s → %s", (name, expected) => {
    expect(riskOf(name)).toBe(expected);
  });
});

test("names are isolated for display, so they can't reorder the text around them", () => {
  expect(isolate("abc")).toBe("\u2068abc\u2069");
});

describe("more invisible characters are removed (S4)", () => {
  // Soft hyphen, Arabic letter mark, Mongolian vowel separator, line and paragraph separators,
  // word joiner and the invisible math operators, interlinear annotation marks, and tag characters.
  test.each([
    ["a\u00adb.txt", "ab.txt"],
    ["a\u061cb.txt", "ab.txt"],
    ["a\u180eb.txt", "ab.txt"],
    ["a\u2028b.txt", "ab.txt"],
    ["a\u2029b.txt", "ab.txt"],
    ["a\u2060b.txt", "ab.txt"],
    ["a\u2062b.txt", "ab.txt"],
    ["a\u2064b.txt", "ab.txt"],
    ["a\ufff9b.txt", "ab.txt"],
    ["a\ufffbb.txt", "ab.txt"],
    ["a\u{e0041}b.txt", "ab.txt"],
    ["a\u{e007f}b.txt", "ab.txt"],
    ["gpj\u202e.exe", "gpj.exe"],
  ])("%j → %j", (input, expected) => {
    expect(safeComponent(input)).toBe(expected);
  });

  test("removing an invisible character can't leave a name that is not in NFC", () => {
    // "e", a soft hyphen, then a combining acute accent: after removal they must still compose.
    expect(safeComponent("cole\u00ad\u0301.txt")).toBe("col\u00e9.txt");
    expect(safeComponent("e\u00ad\u0301.txt")).toBe("\u00e9.txt");
    for (const input of ["e\u2060\u0301", "a\u00ad\u0300b"]) {
      const out = safeComponent(input);
      expect(out).toBe(out.normalize("NFC"));
    }
  });
});

describe("more Windows device names are caught (S4)", () => {
  test.each([
    ["COM\u00b9.txt", "_COM\u00b9.txt"],
    ["com\u00b2", "_com\u00b2"],
    ["LPT\u00b3.log", "_LPT\u00b3.log"],
    ["CONIN$", "_CONIN$"],
    ["conout$.txt", "_conout$.txt"],
    ["con .txt", "_con .txt"],
    ["nul   .txt", "_nul   .txt"],
    ["CONIN$X", "CONIN$X"],
    ["COM\u00b9X", "COM\u00b9X"],
  ])("%j → %j", (input, expected) => {
    expect(safeComponent(input)).toBe(expected);
  });
});

describe("a ZIP's name stays within 255 bytes (S4)", () => {
  const folder = (name: string) => [
    { i: 0, path: `${name}/a.txt`, size: 1, kind: "file" as const, type: "" },
  ];
  test("a folder name of 255 bytes still gives a valid ZIP name", () => {
    const top = safeComponent("x".repeat(400));
    expect(utf8Length(top)).toBe(255);
    const name = zipName(folder(top));
    expect(utf8Length(name)).toBeLessThanOrEqual(255);
    expect(name.endsWith(".zip")).toBe(true);
  });
  test("multi-byte names are cut on a character boundary", () => {
    const name = zipName(folder(safeComponent("😀".repeat(100))));
    expect(utf8Length(name)).toBeLessThanOrEqual(255);
    expect(name.endsWith(".zip")).toBe(true);
    expect(name).not.toContain("\ufffd");
  });
  test("short names are unchanged", () => {
    expect(zipName(folder("Holiday"))).toBe("Holiday.zip");
    expect(zipName([{ i: 0, path: "a.txt", size: 1, kind: "file", type: "" }])).toBe(
      "HANDit files.zip",
    );
  });
});

describe("text from the other device is cleaned before it is shown (S4)", () => {
  test("control, invisible and bidirectional characters are removed", () => {
    expect(cleanPeerText("Mom\u202e\u0007\u200b", 40)).toBe("Mom");
    expect(cleanPeerText("a\u2028b\u00adc\u{e0041}d", 40)).toBe("abcd");
  });
  test("white space is collapsed and trimmed", () => {
    expect(cleanPeerText("  Ravi's \n\t  iPhone  ", 40)).toBe("Ravi's iPhone");
  });
  test("it is cut to the limit in whole characters", () => {
    expect([...cleanPeerText("x".repeat(5000), 40)]).toHaveLength(40);
    const emoji = cleanPeerText("😀".repeat(100), 40);
    expect([...emoji]).toHaveLength(40);
    expect(emoji).not.toContain("\ufffd");
  });
  test("nothing left means an empty string, for the caller to replace", () => {
    expect(cleanPeerText("\u200b\u202e \u0000", 40)).toBe("");
  });
});
