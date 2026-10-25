import { expect, test } from "@playwright/test";

// Optional sign-in, end to end, against a fake GitHub and Google (see e2e/auth). Local only:
// the real providers are never contacted, and the live site has no provider set up yet.
test.skip(!!process.env.BASE_URL, "needs the fake providers of the local test server");

test("sign-in is offered, never required: the guest way is always there", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to HANDit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("You never need an account to send or receive files.")).toBeVisible();
  await page.getByRole("link", { name: "Continue without an account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /^Send/ })).toBeVisible();
});

test("signing in with GitHub, staying signed in, and signing out", async ({ page, context }) => {
  await page.goto("/signin");
  await page.getByRole("link", { name: "Continue with GitHub" }).click();

  // Back on the home page, signed in, with a greeting and a friendlier device name.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Welcome back, Ravi")).toBeVisible();
  await page.getByRole("button", { name: /Account menu: Ravi Kumar/ }).click();
  await expect(page.getByText(/Signed in as\s*Ravi Kumar\s*with GitHub/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();

  await page.goto("/settings");
  await expect(page.getByLabel("Device name")).toHaveValue(/^Ravi's /);

  // The one cookie is HttpOnly and SameSite=Lax, so the page's own scripts can't read it.
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name)).toEqual(["handit_session"]);
  expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  expect(await page.evaluate(() => document.cookie)).toBe("");
  // Nothing about the person but a name and a provider travels in it: no email, picture or id.
  const payload = JSON.parse(
    Buffer.from((cookies[0]?.value ?? "").split(".")[0] ?? "", "base64url").toString(),
  );
  expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "n", "p", "v"]);
  expect(JSON.stringify(payload)).not.toMatch(/ravi@|example\.com|ravi-k/);

  await page.reload();
  await expect(page.getByRole("button", { name: /Account menu: Ravi Kumar/ })).toBeVisible();

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await context.cookies()).map((c) => c.name)).toEqual([]);
});

test("signing in with Google", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page.getByText("Welcome back, Asha")).toBeVisible();
  await page.getByRole("button", { name: /Account menu: Asha Rao/ }).click();
  await expect(page.getByText(/with Google/)).toBeVisible();
});

test("a sign-in that didn't complete explains itself and changes nothing", async ({
  page,
  context,
}) => {
  // A callback that never started here: no pending sign-in, wrong state.
  await page.goto("/auth/github/callback?code=stolen&state=forged");
  await expect(page).toHaveURL(/\/signin\?error=1$/);
  await expect(page.getByRole("alert")).toContainText(
    "Signing in didn't complete, and nothing was changed.",
  );
  expect((await context.cookies()).filter((c) => c.name === "handit_session")).toEqual([]);
  await page.getByRole("link", { name: "Continue without an account" }).click();
  await expect(page.getByRole("link", { name: /^Send/ })).toBeVisible();
});

test("a signed-in person can still send and receive as before", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByRole("link", { name: "Continue with GitHub" }).click();
  await expect(page.getByText("Welcome back, Ravi")).toBeVisible();
  await page.getByRole("link", { name: /^Receive/ }).click();
  await expect(page.getByTestId("countdown")).toBeVisible();
});
