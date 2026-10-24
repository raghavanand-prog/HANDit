# Decisions

Spike results, library choices and any change to an earlier decision, newest first.

## 2026-10-24 — Link and sealed-message details

The protocol fixes what the link and sealed frames contain but leaves a few byte-level details open. These are the choices, all in `web/src/core/link.ts` and `web/src/core/seal.ts`:
- **Base64url is strict:** no padding, only `A–Z a–z 0–9 - _`, and unused trailing bits must be zero, so each payload has exactly one valid spelling. Anything else is `LINK_INVALID`.
- **The version byte is checked before the length,** so a link from a newer version with a different length gets `LINK_UNSUPPORTED_VERSION` ("reload the page") rather than `LINK_INVALID`. Fragments over 1,024 characters are `LINK_INVALID` without being decoded.
- **AES-GCM additional data** is the UTF-8 text `room_id ‖ r ‖ n`: the 32 hex characters of the room ID, the role (`owner` or `guest`, both 5 letters) and `n` in decimal. The first two have fixed lengths, so the joined text is unambiguous.
- **Sealed messages name their type in `t`** (as data-channel messages do), because the `sdp` message already uses `type` for `offer` or `answer`.
- **A frame must be exactly `{r, n, iv, ct}`** with a 12-byte IV and at least a 16-byte tag. Any other shape, a frame over 32 KiB, a frame that fails to open, or a frame whose `r` is the receiver's own role (its own frame sent back to it) counts as tampering (`INTRO_TAMPERED`).
- **Replays and frames after `bye` are rejected** as separate outcomes (`replayed`, `after-bye`) so the session can decide how to react. A frame that opens correctly but holds an invalid message is `invalid`. Unknown extra fields inside a valid message are dropped.
- **Frames are sealed and opened one at a time, in call order,** so sequence numbers always match the order frames are sent and checked.

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
