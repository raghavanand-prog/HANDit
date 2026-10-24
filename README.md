# HANDit

Send photos, videos and files from any phone or computer to any other — just open the link and scan the code. Original quality, never compressed, never uploaded.

> **Status:** under construction — the public test (v0.1) hasn't started yet.
> Public test — not independently security-audited.

## How it works

1. One device shows a QR code. The other scans it with its normal camera app.
2. A tiny server introduces the two browsers. Everything it passes along is sealed with a key only the two devices know, so it can't read or change it.
3. The files go directly from browser to browser over an encrypted WebRTC connection, and every file's SHA-256 fingerprint is checked on arrival.

## Run it locally

Needs Node.js 26.

```bash
npm install
npm run dev                     # the site at http://localhost:5173
npm run check                   # lint, type-check, unit and Worker tests
npx playwright install chromium # once, for the end-to-end tests
npm run test:e2e                # end-to-end tests in a real browser
```

## Project layout

| Folder    | What's inside                                                                         |
| --------- | ------------------------------------------------------------------------------------- |
| `web/`    | The site: Vite, React, TypeScript, Tailwind                                           |
| `worker/` | The Cloudflare Worker that serves the site, and the Room that introduces two browsers |
| `e2e/`    | Playwright end-to-end tests                                                           |
| `docs/`   | Decisions and test results                                                            |

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Credits

Built by Raghav Anand.

## License

[Apache-2.0](LICENSE)
