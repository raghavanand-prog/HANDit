# Testing

How HANDit is tested, what each automated test covers, and the results for each release. Real-device results (pass / fail / blocked, device, browser and version, network, date, notes) are added below as they are collected.

## Running the tests

| What                                                              | Command                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Everything CI runs: lint, type-check, build, web and Worker tests | `npm run check`                                                           |
| Browser tests against a local copy of the site                    | `npm run test:e2e`                                                        |
| The site and scanner browser tests against the live site          | `BASE_URL=https://handit.handit-worker.workers.dev npm run test:e2e:live` |
| A smaller large-file test                                         | `E2E_BIG_MB=64 npm run test:e2e`                                          |

The browser tests drive real Chromium instances, with two separate browser contexts standing in for two devices, through the real Room and a real WebRTC connection.

## Every message code can be triggered

Each code from the message list is shown by a test, or by a documented manual step where the condition can't be created in an automated browser.

| Code                                      | How it is triggered                                                                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINK_INVALID`                            | Browser test: open `/j#not-a-real-code` (`journeys.spec.ts`)                                                                                                                                                                        |
| `LINK_UNSUPPORTED_VERSION`                | Browser test: open a link whose version byte is 2 (`messages.spec.ts`)                                                                                                                                                              |
| `CODE_EXPIRED`                            | Browser test: the owner's countdown reaches zero, using a controlled clock, and **Show new code** makes a new code. A guest joining after the expiry is covered by the Room test "a guest after the expiry gets 4410".              |
| `CODE_ALREADY_USED`                       | Room test "a second guest gets 4409". In the browser, the Room deletes itself once the two devices connect, so a third device then sees `CODE_NOT_ACTIVE`.                                                                          |
| `CODE_NOT_ACTIVE`                         | Browser test: open a link after its owner cancelled                                                                                                                                                                                 |
| `SERVER_UNREACHABLE`                      | Browser test: the Room's WebSocket fails to connect                                                                                                                                                                                 |
| `INTRO_TAMPERED`                          | Unit tests: a changed frame, wrong key or wrong room is rejected (`seal.test.ts`), and the Room client ends the session (`signal.test.ts`)                                                                                          |
| `P2P_FAILED`                              | Browser test: a device that may only use a relay (which HANDit never offers), so no direct path forms, fails after 20 s on both sides; Details lists the candidates found                                                           |
| `PEER_LEFT`                               | Browser test: the sender's tab closes while the recipient reviews. Unit test: the channel closes mid-transfer and finished files stay.                                                                                              |
| `CONNECTION_LOST`                         | Unit test: 45 s of silence on a dead channel                                                                                                                                                                                        |
| `OFFER_DECLINED`                          | Browser test (decline) and unit test                                                                                                                                                                                                |
| `OFFER_TIMEOUT`                           | Unit test: no decision within 120 s on both sides, with a controlled clock. Recipient wording: "No response — nothing was received."                                                                                                |
| `CANCELLED_BY_PEER` / `CANCELLED_BY_USER` | Browser test: the sender cancels while the recipient is reviewing. Unit tests: cancel from either side mid-transfer, with the partial file removed.                                                                                 |
| `STORAGE_TOO_SMALL`                       | Browser test: the browser reports a tiny quota, and **Accept** is disabled with the message                                                                                                                                         |
| `STORAGE_FULL`                            | Manual: receive a file larger than the free browser storage (the check before Accept is bypassed only by storage changing mid-transfer, for example by filling the disk). The worker reports `QuotaExceededError` as this code.     |
| `DOWNLOAD_BLOCKED`                        | Manual: on a browser that blocks multiple downloads, save several files one by one. Browsers give pages no signal for a blocked download, so after a second individual save the page shows the hint to use **Download all (.zip)**. |
| `SOURCE_UNREADABLE`                       | Unit test: a file that can't be read mid-transfer is skipped and the others still arrive                                                                                                                                            |
| `INTEGRITY_FAILED`                        | Unit tests: a file corrupted twice is deleted and reported; corrupted once, it is retried and arrives                                                                                                                               |
| `LIMIT_EXCEEDED`                          | Unit test: more than 10,000 items fails before anything is sent. The Send screen also shows the message and disables the button.                                                                                                    |
| `BROWSER_UNSUPPORTED`                     | Browser test: a browser without WebRTC data channels                                                                                                                                                                                |
| `UNKNOWN_ERROR`                           | Unit tests: malformed or out-of-order messages end the transfer ("protocol error"). The page also shows it for any unexpected exception.                                                                                            |

## Release results

### Automated, per commit

Run by CI on every pull request. Results of the most recent run:

| Suite                                                                                                         | Result   |
| ------------------------------------------------------------------------------------------------------------- | -------- |
| Lint, type-check, build                                                                                       | pass     |
| Web unit tests (links, sealing, hashing, protocol, transfer engine, filename rules, ZIP, devices, signalling) | 259 pass |
| Worker tests (Room, per-IP limits, routing)                                                                   | 40 pass  |
| Browser tests (connection, 1 GiB transfer, ZIP saving, journeys J1, J2 and J6, message codes)                 | all pass |

### Real devices

_Not yet collected._
