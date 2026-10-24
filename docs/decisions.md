# Decisions

Spike results, library choices and any change to an earlier decision, newest first.

## 2026-10-24 — The Room and the per-IP limits

**Per-IP limits use a second, tiny Durable Object, `Limiter`,** one per client address. It counts exactly what the protocol asks for: at most 20 new codes and 60 join attempts per 10 minutes, over a sliding window.
- **What it stores:** only the times of recent allowed attempts. It deletes them 10 minutes after the last one, using an alarm. It never stores the address itself, and nothing is logged.
- **How addresses are counted:** IPv4 addresses one by one. IPv6 addresses per /64, because one user usually controls a whole /64 and could otherwise rotate through it.
- **Why not Cloudflare's built-in rate limiter:** it only counts over 10- or 60-second windows, approximately and separately in each Cloudflare location. Using it would have loosened the 10-minute limits.
- **Cost:** about 2 extra Durable Object requests per transfer, well inside the free plan.
- **Plan change:** this adds a second Durable Object class to the stack, which planned only `Room`.

**Refusals use WebSocket close codes.** A browser can read a WebSocket's close code but not the HTTP status of a refused upgrade. So the Worker and the Room accept the connection, then close it straight away with one of these codes:

| Code | Meaning                                          | What the page shows                   |
| ---- | ------------------------------------------------ | ------------------------------------- |
| 4404 | No owner, or the owner has left                  | `CODE_NOT_ACTIVE`                     |
| 4409 | A guest already joined (or a second owner tried) | `CODE_ALREADY_USED`                   |
| 4410 | The code's lifetime is over                      | `CODE_EXPIRED`                        |
| 4429 | Per-IP limit, or more than 100 frames in a room  | `UNKNOWN_ERROR` (Details: the reason) |
| 4413 | A frame over 32 KiB                              | `UNKNOWN_ERROR`                       |
| 4400 | A binary frame                                   | `UNKNOWN_ERROR`                       |
| 4408 | The room reached its 10-minute maximum life      | `UNKNOWN_ERROR`                       |
| 1000 | The other side left                              | Depends on the stage                  |

Requests that aren't WebSocket upgrades get HTTP 426, and malformed `role`/`ttl` queries get HTTP 400. Only HANDit's own page sends those, so a plain HTTP status is enough.

**Either side leaving ends the Room.** The Room can't see the sealed `bye`. Instead, both browsers close their WebSocket after `bye`, and when one side closes, the Room closes the other and deletes everything. This covers "both sides sent bye" and "the owner left before a guest joined". It also tells a waiting side straight away that the other side is gone. A breach of the frame limits also ends the Room for both sides.

**State that must survive the Room sleeping (the Hibernation API)** is kept in two places:
- The code's expiry and whether a guest has joined are in Durable Object storage: 2 writes per code.
- Each socket's frame count is in its WebSocket attachment, which costs no storage writes.

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
