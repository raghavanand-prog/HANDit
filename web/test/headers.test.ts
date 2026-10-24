import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CSP, SECURITY_HEADERS } from "../../worker/src/headers";

// The site's static files get their headers from public/_headers and the Worker's own
// responses from worker/src/headers.ts. They must say the same thing.
test("public/_headers matches the Worker's security headers", () => {
  const file = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  const rules = Object.fromEntries(
    file
      .split("\n")
      .filter((line) => /^\s+[A-Za-z-]+: /.test(line))
      .map((line) => {
        const [name, ...value] = line.trim().split(": ");
        return [name as string, value.join(": ")];
      }),
  );
  expect(rules).toEqual(SECURITY_HEADERS);
  expect(rules["Content-Security-Policy"]).toBe(CSP);
});

test("the policy allows only the site's own origin and no inline code", () => {
  expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:|wss?:|\*/);
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ]) {
    expect(CSP.split("; ")).toContain(directive);
  }
});
