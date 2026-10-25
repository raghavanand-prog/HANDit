# Decisions

Spike results, library choices and any change to an earlier decision, newest first.

## 2026-10-24 — Name check (D-01)

A web search for "HANDit" with file transfer, app, software and website found no tool or app with exactly this name. The closest is **handitoff**, a small browser-based transfer tool with QR pairing listed on Product Hunt (one listing, almost no traction): similar idea, different name. Other results were unrelated (MOVEit, SHAREit). No change of name. A formal trademark search is deferred until HANDit grows, as the plan says.

## 2026-10-24 — Confirm who receives (T-19)

The sender taps **Allow** before the file list is sent. It was built with the screens (T-09) rather than in week 3, because the flow is simpler to build once than to retrofit, and it is **on by default**: it closes the residual of threat T4 (someone else opens a send code first) for everyone, not only for people who find the setting. The sender can switch it off in Settings.
- The joining device's name is shown with "name not verified", and nothing is offered to it while the sender decides.
- **Don't allow** tells the other device the transfer was cancelled; it never sees the file list. The sender can then show a new code for the person they meant.
- It only applies when the sender owns the code (J1 and Copy link). When the receiving device shows the code (J2), the scanning device is the sender and chooses its own files, so there is nobody to confirm.
- Where the plan's journey text (§3.2 step 4) has the sender see "Pixel 8 joined · Waiting for them to accept…", that screen now comes after Allow.

## 2026-10-24 — Installable app and sharing from the Android gallery (T-18)

**Installable:** a web app manifest (name, icons including a maskable one, standalone display, theme colours) and a service worker. Chromium's own installability check reports no errors, so Chrome on Android and desktop offer to install it. Safari on iPhone can add it to the Home Screen (the manifest and an Apple touch icon are provided).

**The service worker caches only the page shell:** the page, its hashed scripts and styles, the icons and the manifest. It never caches a WebSocket, a POST, another origin, or anything a transfer touches (a test lists the cache contents). Pages use the network first and fall back to the cached shell, so an installed app opened offline shows the plain "Couldn't reach HANDit" screen instead of a browser error. Old cache versions are deleted when a new worker takes over.

**Spike: sharing from the Android gallery into the installed app.**
- **Built:** a `share_target` in the manifest (POST, multipart, any file type). The service worker receives the files, parks them in a temporary cache entry and opens `/send?shared=<id>`; the Send page takes them out and deletes the entry at once, and a share that was never opened is deleted on the next visit. So nothing the user shared stays in the browser.
- **Verified:** the hand-off in Chromium (files shared by a POST to the share target arrive in the Send list with the right names and sizes, the hand-off copy is gone, and a transfer started from them completes with the badge).
- **Not verified:** Android's real Share menu, and whether the browser hands the service worker the original bytes of a gallery photo (the same question as spike T-12 about what Chrome hands over). It is checked on the borrowed Android phone with T-12: share a photo with a known SHA-256 into the installed app, send it, and compare hashes. Until then the limitation "Received files go to Downloads, not the gallery" stands, and the file picker remains the sure way to send originals.
- **Privacy note:** the temporary cache entry is the only time a shared file is stored by HANDit outside the transfer's own private storage; it exists for the moment between the share and the Send page opening.

## 2026-10-24 — Webcam scanner (T-17): decoding approach

**Question (the plan's spike):** which QR decoding approach works in each major browser, for laptop ↔ laptop without Copy link?

**Choice:** the `qr` library's own camera helpers (`selfieCamera`, `QRCanvas`) and decoder, already a dependency for drawing codes. No second library is needed. The library uses the browser's native barcode detection where it exists and its own decoder otherwise, so there is one code path for HANDit to maintain.

**Results** (the same measurements every run, in CI):

| Engine   | Clean 6 px, non-integer 3.3 px, softened and noisy frames (10 different codes each) | Hard case: tiny 2.6 px modules, softened and noisy (20 codes) |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Chromium | reads 10 of 10 in every case                                                        | reads 5 of 20                                                 |
| Firefox  | reads 10 of 10 in every case                                                        | reads 8 of 20                                                 |
| WebKit   | reads 10 of 10 in every case                                                        | reads 13 of 20                                                |

The frames are drawn on a canvas the way a camera delivers them, in each engine. The hard case isn't required to pass; it shows the limit: a code that is tiny and blurry on the camera's image may not be read, so the scan screen asks people to hold the screen where the camera can see it clearly. A **real camera** was exercised only in Chromium, with a fake webcam device showing the other laptop's code: both journeys (J1 and J2) complete without Copy link. Real laptop webcams in Safari and Firefox have not been tried on hardware, so the scanner stays a convenience: Copy link remains on every code screen, and a camera that is missing, blocked or can't read the code is explained on the scan screen.

**Scanner rules:** only a link from this site's own origin and path `/j` is accepted; anything else (a Wi-Fi code, another site's link) is ignored and scanning continues. The camera is stopped as soon as a code is read, and no video leaves the page. The Permissions-Policy allows the camera for the site only.

## 2026-10-25 — Per-IP limits raised from 20 / 60 to 100 / 300

The plan's §5.4 set at most 20 new codes and 60 join attempts per client address every 10 minutes. Repeated testing from one network, and several people sharing one Wi-Fi or a campus network (which count as one address), hit that too easily. The owner asked for it to be raised; it is now **100 codes and 300 join attempts per 10 minutes**, with everything else about the Limiter unchanged (sliding window, IPv6 per /64, nothing stored but attempt times).

It is not unlimited on purpose: the free Cloudflare plan allows about 100,000 Worker requests a day, and a single script with no limit could use them all, stopping the site for everyone until midnight UTC (threat T7). At 100 codes per 10 minutes one address can make about 14,000 codes a day, which is below that ceiling.

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
