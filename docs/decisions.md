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

## 2026-10-25 — A flatter, quieter look

The interface moved to a minimal, Apple-like visual language at the owner's request: near-monochrome (graphite on white, white on black in the dark theme), the system's own type at large sizes with tight spacing, flat backgrounds with no gradients, pill buttons, one blue (a deeper shade in the light theme so link text stays above 4.5:1 on the grey bands) used only for actions and links, and a sticky translucent header. The marigold tag colour is retired from the interface (the code is now a graphite card), as are the tinted pills, icon tiles and boxed cards. The home page is one big statement per band on alternating white and light-grey, with the hand-off animation under the headline. No change to behaviour; all accessibility checks pass in both themes.

## 2026-10-25 — Optional sign-in, and a new home page

**Optional sign-in with GitHub and Google (the plan's D-19 said "no accounts").** The owner asked for a login page. It is built so the product promise survives: signing in is **never required**, and the guest path is always the clear way on. What it adds is a name: the person's first name in the header, a greeting, and a friendlier device name ("Ravi's iPhone") for the other device to see.
- **Nothing is stored on the server.** No database, no user table. After the provider confirms who you are, the server puts a name and the provider in a signed cookie (HMAC-SHA-256, 7 days) and forgets you. The email, picture and provider's id are never read, let alone kept. Sign out deletes the cookie.
- **The standard flow, done carefully:** authorization code with `state` and PKCE (S256), a short-lived signed "pending sign-in" cookie, the provider's secret used only on the server, `HttpOnly`, `Secure`, `SameSite=Lax` and `__Host-` cookies, a cleaned display name (control and bidirectional characters removed), and a sign-out that refuses other sites. A changed, expired or foreign cookie is simply "signed out".
- **Off until configured.** Each provider appears only if its client ID and secret are set, and the whole feature needs a strong `SESSION_SECRET`. Until then the site shows no Sign in link at all, so there is no dead button.
- **One Worker request per page visit** for the sign-in state (`/auth/me` answers both "who" and "which providers"), so it stays well inside the free plan's 100,000 requests a day. The service worker never caches `/auth/*`.
- **Privacy page updated:** no account is needed; if you choose to sign in, one cookie keeps your name and provider; the server stores nothing about you. The plan's "no cookies" rule now reads "no cookies unless you choose to sign in".
- **Tested** with a fake GitHub and Google that run only on the local test server (31 Worker tests and 5 browser tests); the real providers are connected by the owner (see `docs/security-review.md`).

**Known limitations is no longer a page of its own.** It left the footer; the same eight points now sit under "Good to know" on the Help page, where people look when something doesn't work. The plan's requirement to publish them is met.

**New home page:** a hero with an animated picture of a laptop handing files straight to a phone (locked in between), the main actions, three reasons to trust it, three steps, the platforms and a closing call to action; sections rise in as they scroll into view. All motion stops for people who ask for reduced motion.

## 2026-10-25 — Per-IP limits raised from 20 / 60 to 100 / 300

The plan's §5.4 set at most 20 new codes and 60 join attempts per client address every 10 minutes. Repeated testing from one network, and several people sharing one Wi-Fi or a campus network (which count as one address), hit that too easily. The owner asked for it to be raised; it is now **100 codes and 300 join attempts per 10 minutes**, with everything else about the Limiter unchanged (sliding window, IPv6 per /64, nothing stored but attempt times).

It is not unlimited on purpose: the free Cloudflare plan allows about 100,000 Worker requests a day, and a single script with no limit could use them all, stopping the site for everyone until midnight UTC (threat T7). At 100 codes per 10 minutes one address can make about 14,000 codes a day, which is below that ceiling.

## 2026-10-24 — The Room and the per-IP limits

**Per-IP limits use a second, tiny Durable Object, `Limiter`,** one per client address. It counts exactly what the protocol asks for: at most 20 new codes and 60 join attempts per 10 minutes, over a sliding window.
- **What it stores:** only the times of recent allowed attempts. It deletes them 10 minutes after the last one, using an alarm. HANDit's code never writes the address into the object's data and nothing is logged, but the object's **name is the address** (the /64 for IPv6), so Cloudflare's systems hold it for as long as the object exists, which is at most 10 minutes after the last attempt.
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

## 2026-10-26 — Hardening after a review of the Worker, the page and the live site

**What changed:** small fixes, none of which touches the protocol (§5) or the security rules (§6).
- **Sign-in routes are rate limited.** `/auth/<provider>/start` and `/callback` count against the same per-IP `Limiter`: at most 30 attempts per 10 minutes. Without it, a script could make the Worker call GitHub or Google over and over with our client secret. Both calls to a provider now have a 5-second time limit, and an error status from the provider fails the sign-in.
- **A pending sign-in is not a session.** Both are signed with the same key, so each now carries its kind (`t`) and `verify` requires it. Before, the cookie anyone gets at the start of a sign-in could be sent back as a session. Sessions last 7 days instead of 30; logging out only clears the cookie, so a shorter life limits a stolen one.
- **The Room does its clean-up once.** Closing a Room fires one event per socket; only the first now wipes the storage. Frame size is checked by character count first, then by exact bytes.
- **The receiver refuses a data message larger than one chunk (64 KiB)** before queueing it. It still has no limit on how much it has queued; an honest receiver with a slow disk can legitimately fall behind, so a limit there could break a real transfer.
- **Files shared into the installed app** (`/share-target`) are accepted only from the app or the system share sheet (`Sec-Fetch-Site`, or `Origin` when that is missing), at most 1,000 files at a time. A form on another site can no longer fill the send list.
- **The service worker no longer keeps an HTML page under a script's address.** The single-page fallback answers any unknown path with the app's HTML and status 200.
- **Names from the other device are cleaned before they are shown:** control and invisible characters removed, cut to 40 characters, an empty name shown as "Unnamed device". The filename rules also cover more invisible characters (soft hyphen, line separators, tag characters and others), the superscript COM and LPT names, `CONIN$`, `CONOUT$` and names like `con .txt`. Invisible characters are removed before normalising to NFC, a ZIP's name is cut to 255 bytes, and more script and installer types get the warning.
- **Accept stays off until the storage check has finished,** in the code as well as the button.
- **"Couldn't connect directly" is shown on both sides.** Both devices give up after the same time, the guest a moment earlier; the one that gives up leaves the Room, which closes the other's connection with "Peer left". That was shown as "can't reach the server" on whichever side lost the race, and made one end-to-end test fail about 1 run in 6 on slow machines. Once the two have met, "Peer left" now counts as a failed connection.

**Not changed, on purpose:** the file type the sender claims is still kept (rule 6 says never change metadata), and a room ID can still be claimed again after its Room has ended (a fix would keep a short-lived record, which §6 forbids). Both are open decisions for the owner.

## 2026-10-26 — Second review: attacks tried against the code and the running app

Five reviews, two of them attacking a local copy, found no way to read or alter the sealed introduction, to save an unverified file, or to write outside the transfer. What they did find is fixed here; none of it changes the protocol (§5) or weakens a rule in §6.

**A hostile sender**
- **The page could be frozen before anything was shown.** Renaming repeated file names rescanned from "(1)" every time, so 10,000 files called `a.txt` took about 10 seconds and 3,000 long names about 100. Numbering now resumes where it stopped.
- **The offer was unbounded in memory.** A media type could be 60 KB per item. A type is now at most 127 printable ASCII characters, and all paths and types of one offer together at most 8 MiB.
- **An offer with no files showed "Identical ✓".** The badge now needs at least one file, and every file verified (`allIdentical`).
- **The sender no longer takes the receiver's summary on trust.** It must name every file exactly once and nothing else.
- **Names.** Two names are compared the way macOS and Windows compare them (the long s and S, the sharp s and SS), lone surrogates are replaced, and `.invoice.exe` is recognised as an app. Many more types get the app warning (HTML, SVG, macro Office files, RDP, disk images and others). A long name is cut in the middle so its extension always shows, and "N photos" no longer counts a file that is an app by its name.

**The page**
- **The link's secret stayed in the address bar and history** when the link was opened in a tab already showing the app, or with `/J`, `/j/`. Now any link-sized fragment is read and removed, whatever the path, and when the fragment changes in an open page. Leaving the join screen forgets the secret, so Back doesn't join again. The browser's Back and Forward buttons now ask first during a transfer, like the in-page links do.
- **Connection details from the other device are checked** before the browser sees them: a data section only (no audio or video), and exactly one SHA-256 fingerprint. ICE candidates are not filtered: dropping loopback or link-local addresses could break connections on the same network, and a peer that holds the secret can already make the browser contact any address it likes.
- **A frame arriving just before the Room closed could be lost.** The last frames (the other device's "bye", its final connection details) were dropped when the close was handled first. Frames are now opened in order and a close is reported after them, and "Peer left" after a "bye" no longer ends a connection that is about to open.
- **Allow and Accept** ignore clicks for the first 0.4 seconds on screen, so a click meant for the screen before can't land on them.
- **The other device's text:** its browser label is only ever a known browser on a known system, and stacked accents are cut to two per letter.

**The Worker**
- **The test settings do nothing on the live site.** `OAUTH_BASE_URL` (which would send the sign-in secret to another host) and `LIMIT_MULTIPLIER` (which lifts the limits up to 1,000 times) are honoured only for requests to localhost.
- **IPv6 is counted per /48 as well as per /64.** An ISP can give one customer a /48 (65,536 /64s) and each /64 had its own count. The /48 gets ten times a /64's limits; IPv4 is unchanged and costs no extra call.
- The Worker's own replies are never cached (`Cache-Control: no-store`), and `X-Frame-Options: DENY` is sent next to `frame-ancestors 'none'` for old browsers.

**Left as they are, for the owner to decide**
- **The per-IP limits (100 codes and 300 joins per 10 minutes). Decision: kept as they are (owner, 2026-10-26); a rate limit in front of the Worker is the planned protection.** One IPv4 address can reach roughly 14,000 new rooms a day. At about six storage writes each that is near the free plan's 100,000 daily writes, so one address could block everyone until midnight UTC. The request count was weighed when the limit was raised; the writes were not.
- **The file type a sender claims is kept** (rule 6: never change metadata). Where a browser opens a received file instead of downloading it, a claimed `text/html` renders under the site's origin; the CSP still blocks any script.
- **A room ID can be claimed again once its Room has ended.** Someone holding a leaked link could then meet a late guest. A tombstone would break "keeps nothing"; the alternative is for the guest to refuse a link whose expiry time has passed, which gives that advisory byte an effect.
- The Room allows 100 frames in all. A device with many network interfaces could reach that while connecting.

## 2026-10-26 — A rate limit in front of the Durable Objects

**Need:** the owner kept the per-IP limits at 100 codes and 300 joins per 10 minutes (see above) and wanted a Cloudflare rate limit in front of them. A request refused by the Limiter still costs a Worker request and a Limiter call, and a flood of attempts is uncapped.

**Choice:** Cloudflare's Workers Rate Limiting binding, three of them, counted per client address (the /64 for IPv6) and checked before any Durable Object is touched: **10 new codes, 30 joins and 3 sign-in attempts per minute**. These are the Limiter's own rates per minute (100 per 10 minutes is 10 a minute), so the stated limits don't change; they are now also enforced as a rate. The Limiter stays as the exact backstop. Requests that are invalid (bad room id, bad role, wrong Origin) are turned away before they are counted, and the read-only `/auth/me` and `/auth/providers` calls are not counted.

**Limits of it:** Cloudflare counts per location and approximately, so it is a flood shield, not an exact meter. Its periods can only be 10 or 60 seconds. It does not lower the daily ceiling for one address below what the Limiter already allows; it keeps a flood from reaching the Durable Objects at all and spreads a burst over time. It is skipped for localhost and `*.test` hosts, so the local test server and the Worker's own tests are unaffected.

**Free plan:** Cloudflare's documentation does not say the binding is paid-only, and does not say it is included on the free plan either. This has not been confirmed by a deploy. If the binding is missing or fails at run time, the Worker lets the request through to the Limiter. If Cloudflare refuses the configuration when deploying, the deploy fails and the previous version stays live; remove the `ratelimits` entry from `worker/wrangler.jsonc` and deploy again.
