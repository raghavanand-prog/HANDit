# Decisions

Spike results, library choices and any change to an earlier decision, newest first.

## 2026-10-24 — QR code library: `qr`

**Need:** draw the QR code for a link in the browser. Scanning is done by phones' own camera apps, so only encoding is needed in v0.1.

**Choice:** [`qr`](https://github.com/paulmillr/qr) by Paul Miller.

**Why:**
- Zero dependencies, so nothing else is pulled into the site.
- Maintained (latest release September 2026); licensed MIT or Apache-2.0, both compatible with HANDit's Apache-2.0.
- Returns the code as a plain matrix (`encodeQR(text, 'raw')`), so HANDit draws it as its own SVG — nothing a strict Content Security Policy would block.
- Ships a decoder as a separate module, which the planned in-page webcam scanner can reuse instead of adding a second library.

**Also considered:** `lean-qr` (smaller, but encode-only), `qrcode` (three dependencies, including a command-line parser), `qrcode-generator` and `uqr`.

**When it's installed:** with the first screen that draws a code, so no unused dependency ships before then.
