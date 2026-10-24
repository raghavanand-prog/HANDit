import { expect, test } from "vitest";
import { strings } from "../src/strings";

test("the public-test label is exact", () => {
  expect(strings.auditLabel).toBe("Public test — not independently security-audited");
});
