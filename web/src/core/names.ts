// Filename rules. Every path component from the other device goes through these
// before it becomes a download name, a ZIP entry or a file in a chosen folder.
import type { OfferItem } from "./protocol";

export class UnsafeOffer extends Error {}

const MAX_NAME_BYTES = 255;
// U+0001–U+001F and U+007F–U+009F (NUL is handled separately: it rejects the offer).
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const CONTROL = /[\u0001-\u001f\u007f-\u009f]/g;
// Invisible and bidirectional formatting characters, which can disguise "gpj.exe" as "exe.jpg":
// soft hyphen, Arabic letter mark, Mongolian vowel separator, zero-width and bidi marks, line and
// paragraph separators, word joiner and invisible operators, bidi isolates, the byte-order mark,
// interlinear annotation marks and the Unicode tag block.
const INVISIBLE =
  /[\u00ad\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;
const RESERVED_CHARS = /[<>:"/\\|?*]/g;
// Windows treats "CON .txt" like "CON.txt", and the superscript digits like the plain ones.
const RESERVED_NAMES =
  /^(con|prn|aux|nul|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3]) *(\.|$)/i;
const RISKY = new Set(
  `exe msi bat cmd ps1 vbs js scr com lnk msix apk app pkg dmg command sh jar
   hta reg msc pif scf url wsf wsh vbe jse dll iso appimage desktop deb rpm jnlp py pl rb
   html htm xhtml shtml svg mht mhtml chm cpl theme library-ms search-ms rdp docm xlsm pptm xll
   ps1xml psm1 inf ocx sys vhd vhdx img cab appx appxbundle application terminal workflow
   webloc inetloc xbap gadget bin run bash ws vb`.split(/\s+/),
);

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** Splits "name.ext" into ["name", ".ext"]. A leading dot (".bashrc") is not an extension. */
function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** UTF-8 length of one character (a code point). */
const charBytes = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

/** Cuts a string to at most `max` UTF-8 bytes, on a character boundary. */
function cut(text: string, max: number): string {
  let out = "";
  let used = 0;
  for (const ch of text) {
    used += charBytes(ch);
    if (used > max) break;
    out += ch;
  }
  return out;
}

/**
 * The key two names are compared by. macOS and Windows fold case beyond toLowerCase (the long s
 * and "S", the sharp s and "SS"), so folding up and down catches what they would treat as one.
 */
const fold = (name: string) => name.toUpperCase().toLowerCase();

/** Fits a name within 255 bytes, cutting before the extension. */
export function fitName(base: string, extension: string): string {
  if (bytes(base + extension) <= MAX_NAME_BYTES) return base + extension;
  if (bytes(extension) >= MAX_NAME_BYTES - 1) return cut(base + extension, MAX_NAME_BYTES);
  return cut(base, MAX_NAME_BYTES - bytes(extension)) + extension;
}

/** Rules 1 and 3–8 for one path component (rule 2 is checked on the whole path). */
export function safeComponent(raw: string): string {
  // Invisible characters go before normalising, so what is left can't be a non-NFC sequence.
  // A lone surrogate can't be written to a file system; it would also make ZIP names collide.
  let name = raw
    .replace(/\p{Surrogate}/gu, "\ufffd")
    .replace(CONTROL, "_")
    .replace(INVISIBLE, "")
    .normalize("NFC");
  name = name.replace(RESERVED_CHARS, "_");
  name = name.replace(/^ +/, "").replace(/[ .]+$/, "");
  if (!name) return "_";
  if (RESERVED_NAMES.test(name)) name = `_${name}`;
  return fitName(...splitExtension(name));
}

/** Rule 2: these reject the whole offer. */
function checkPath(path: string) {
  if (path.includes("\u0000")) throw new UnsafeOffer("a name contains a NUL character");
  if (/^[/\\]/.test(path) || /^[a-z]:/i.test(path)) throw new UnsafeOffer("an absolute path");
  for (const part of path.split("/")) {
    if (part === "" || part === "." || part === "..") {
      throw new UnsafeOffer("an empty, '.' or '..' path component");
    }
  }
}

/**
 * Applies the filename rules to a whole file list: rejects it if any path is unsafe,
 * makes every component safe, and resolves collisions case-insensitively (rule 9).
 */
export function makeSafe(items: OfferItem[]): OfferItem[] {
  for (const item of items) checkPath(item.path);
  const folders = new Map<string, string>(); // raw folder path → safe folder path
  const taken = new Map<string, Set<string>>(); // safe folder path → names in use (folded)
  // Where to resume numbering for a wanted name, so each repeat costs one step, not a rescan.
  const resume = new Map<string, Map<string, number>>();

  const claim = (parent: string, wanted: string, isFolder: boolean) => {
    const used = taken.get(parent) ?? new Set<string>();
    taken.set(parent, used);
    const next = resume.get(parent) ?? new Map<string, number>();
    resume.set(parent, next);
    const [base, extension] = isFolder ? [wanted, ""] : splitExtension(wanted);
    let name = wanted;
    if (used.has(fold(name))) {
      const key = fold(wanted);
      let n = next.get(key) ?? 1;
      for (; ; n++) {
        name = fitName(base, ` (${n})${extension}`);
        if (!used.has(fold(name))) break;
      }
      next.set(key, n + 1);
    }
    used.add(fold(name));
    return parent ? `${parent}/${name}` : name;
  };
  const folder = (raw: string): string => {
    const known = folders.get(raw);
    if (known !== undefined) return known;
    const slash = raw.lastIndexOf("/");
    const parent = slash < 0 ? "" : folder(raw.slice(0, slash));
    const safe = claim(parent, safeComponent(raw.slice(slash + 1)), true);
    folders.set(raw, safe);
    return safe;
  };

  return items.map((item) => {
    if (item.kind === "dir") return { ...item, path: folder(item.path) };
    const slash = item.path.lastIndexOf("/");
    const parent = slash < 0 ? "" : folder(item.path.slice(0, slash));
    return { ...item, path: claim(parent, safeComponent(item.path.slice(slash + 1)), false) };
  });
}

/** "name.ext" → "name (n).ext", still within 255 bytes. */
export function withNumber(name: string, n: number): string {
  const [base, extension] = splitExtension(name);
  return fitName(base, ` (${n})${extension}`);
}

/** Rule 10: "app" for apps, installers and scripts; "disguised" for names like invoice.pdf.exe. */
export function riskOf(name: string): "app" | "disguised" | null {
  // ".invoice.exe" is a file called "invoice" with the extension .exe, hidden from a plain listing.
  const parts = name.toLowerCase().replace(/^\.+/, "").split(".");
  if (parts.length < 2 || !parts[0]) return null;
  if (!RISKY.has(parts.at(-1) ?? "")) return null;
  return parts.length > 2 ? "disguised" : "app";
}

/** Rule 11: wraps a name in first-strong isolate marks for display in plain text. */
export const isolate = (name: string) => `⁨${name}⁩`;

/**
 * Text from the other device (its name, its browser) made safe to show: control and invisible
 * characters removed, white space collapsed, cut to `max` characters. Empty if nothing is left.
 */
export function cleanPeerText(raw: string, max: number): string {
  const text = raw
    .replaceAll("\u0000", " ")
    .replace(CONTROL, " ")
    .replace(INVISIBLE, "")
    .normalize("NFC")
    // A letter keeps at most two accents or other combining marks; more only smears the text.
    .replace(/(\p{M}{2})\p{M}+/gu, "$1");
  return [...text.replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
}
