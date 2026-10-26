import { afterEach, describe, expect, test, vi } from "vitest";
import { type AuthEnv, handleAuth } from "../src/auth";

// Optional sign-in with GitHub or Google. Stateless: a signed cookie holds the first name and
// the provider, nothing else, and nothing is stored on the server. The provider's own servers
// are replaced here by a fake fetch, so no real account is involved.
const SECRET = "test-secret-test-secret-test-secret-1234";
const env: AuthEnv = {
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret-VALUE",
  GOOGLE_CLIENT_ID: "g-id",
  GOOGLE_CLIENT_SECRET: "g-secret-VALUE",
  SESSION_SECRET: SECRET,
};
const ORIGIN = "https://handit.test";

const call = (path: string, init: RequestInit = {}, e: AuthEnv = env) =>
  handleAuth(
    new Request(`${ORIGIN}${path}`, { redirect: "manual", ...init }),
    e,
  ) as Promise<Response>;
const cookiesOf = (response: Response) =>
  Object.fromEntries(
    response.headers.getSetCookie().map((c) => {
      const [pair = ""] = c.split(";");
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
const cookieHeader = (cookies: Record<string, string>) =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

/** Start a sign-in and return what the provider would see, plus the state cookie. */
async function start(provider: string, e: AuthEnv = env) {
  const response = await call(`/auth/${provider}/start`, {}, e);
  const location = new URL(response.headers.get("location") ?? "");
  return { response, location, cookies: cookiesOf(response) };
}

function fakeProvider(profile: object, options: { tokenFails?: boolean } = {}) {
  const seen: { url: string; body: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? String(init.body) : "";
    seen.push({ url, body });
    if (/access_token|\/token/.test(url)) {
      return options.tokenFails
        ? new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 })
        : new Response(JSON.stringify({ access_token: "provider-token", token_type: "bearer" }));
    }
    if (/\/user|userinfo/.test(url)) return new Response(JSON.stringify(profile));
    return new Response("unexpected", { status: 500 });
  });
  return seen;
}
afterEach(() => vi.restoreAllMocks());

async function signIn(provider: "github" | "google", profile: object) {
  const seen = fakeProvider(profile);
  const { location, cookies } = await start(provider);
  const callback = await call(
    `/auth/${provider}/callback?code=the-code&state=${location.searchParams.get("state")}`,
    { headers: { cookie: cookieHeader(cookies) } },
  );
  return { callback, seen, session: cookiesOf(callback), location };
}

describe("providers", () => {
  test("only configured providers are offered", async () => {
    expect(await (await call("/auth/providers")).json()).toEqual({ github: true, google: true });
    const onlyGithub = { ...env, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined };
    expect(await (await call("/auth/providers", {}, onlyGithub)).json()).toEqual({
      github: true,
      google: false,
    });
    expect(await (await call("/auth/providers", {}, {})).json()).toEqual({
      github: false,
      google: false,
    });
  });

  test("a weak or missing session secret turns sign-in off entirely", async () => {
    for (const SESSION_SECRET of [undefined, "", "short"]) {
      const weak = { ...env, SESSION_SECRET };
      expect(await (await call("/auth/providers", {}, weak)).json()).toEqual({
        github: false,
        google: false,
      });
      expect((await call("/auth/github/start", {}, weak)).status).toBe(404);
    }
  });

  test("an unconfigured provider can't be started", async () => {
    expect((await call("/auth/github/start", {}, {})).status).toBe(404);
    expect((await call("/auth/nope/start")).status).toBe(404);
  });
});

describe("starting a sign-in", () => {
  test.each([
    ["github", "https://github.com/login/oauth/authorize", "gh-id", "read:user"],
    ["google", "https://accounts.google.com/o/oauth2/v2/auth", "g-id", "openid profile"],
  ])(
    "%s: sends the browser to the provider with state and PKCE",
    async (provider, base, id, scope) => {
      const { response, location, cookies } = await start(provider);
      expect(response.status).toBe(302);
      expect(`${location.origin}${location.pathname}`).toBe(base);
      expect(location.searchParams.get("client_id")).toBe(id);
      expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/${provider}/callback`);
      expect(location.searchParams.get("scope")).toBe(scope);
      expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(location.searchParams.get("code_challenge_method")).toBe("S256");
      expect(location.search).not.toContain("secret");
      // The pending sign-in is a short-lived, signed, HttpOnly cookie.
      const header = response.headers.getSetCookie().join("\n");
      expect(Object.keys(cookies)).toEqual(["__Host-handit_oauth"]);
      expect(header).toMatch(/HttpOnly/);
      expect(header).toMatch(/Secure/);
      expect(header).toMatch(/SameSite=Lax/);
      expect(header).toMatch(/Max-Age=600/);
      expect(header).toMatch(/Path=\//);
    },
  );

  test("every sign-in gets its own state", async () => {
    const a = await start("github");
    const b = await start("github");
    expect(a.location.searchParams.get("state")).not.toBe(b.location.searchParams.get("state"));
  });
});

describe("finishing a sign-in", () => {
  test("GitHub: exchanges the code with the PKCE verifier and the secret, and signs the user in", async () => {
    const { callback, seen, session } = await signIn("github", {
      login: "ravi",
      name: "Ravi Kumar",
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/");
    const exchange = seen.find((s) => /access_token/.test(s.url));
    expect(exchange?.body).toContain("code=the-code");
    expect(exchange?.body).toContain("client_secret=gh-secret-VALUE");
    expect(exchange?.body).toMatch(/code_verifier=[A-Za-z0-9_-]{43,}/);
    expect(exchange?.body).toContain(
      `redirect_uri=${encodeURIComponent(`${ORIGIN}/auth/github/callback`)}`,
    );
    expect(Object.keys(session)).toContain("__Host-handit_session");
    expect(session["__Host-handit_oauth"]).toBe(""); // the pending sign-in is cleared

    const me = await call("/auth/me", {
      headers: {
        cookie: cookieHeader({ "__Host-handit_session": session["__Host-handit_session"] ?? "" }),
      },
    });
    expect(await me.json()).toMatchObject({ user: { name: "Ravi Kumar", provider: "github" } });
    expect(me.headers.get("cache-control")).toBe("no-store");
  });

  test("Google: uses the given name, and falls back to nothing sensitive", async () => {
    const { session } = await signIn("google", {
      name: "Asha Rao",
      given_name: "Asha",
      email: "asha@example.com",
      picture: "https://x/p.jpg",
    });
    const me = await call("/auth/me", {
      headers: {
        cookie: cookieHeader({ "__Host-handit_session": session["__Host-handit_session"] ?? "" }),
      },
    });
    expect(await me.json()).toMatchObject({ user: { name: "Asha Rao", provider: "google" } });
  });

  test("the session holds a name and a provider and nothing else: no email, no picture, no id", async () => {
    const { session } = await signIn("google", {
      name: "Asha",
      email: "asha@example.com",
      picture: "https://x/p.jpg",
      sub: "12345",
    });
    const token = session["__Host-handit_session"] ?? "";
    const payload = JSON.parse(
      atob((token.split(".")[0] ?? "").replaceAll("-", "+").replaceAll("_", "/")),
    );
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "n", "p", "t", "v"]);
    expect(token).not.toContain("asha@");
  });

  test("a name from the provider is cleaned: no control or bidirectional characters, limited length", async () => {
    const { session } = await signIn("github", {
      login: "x",
      name: `‮evil​\u0007 ${"n".repeat(200)}`,
    });
    const me = await call("/auth/me", {
      headers: {
        cookie: cookieHeader({ "__Host-handit_session": session["__Host-handit_session"] ?? "" }),
      },
    });
    const { user } = (await me.json()) as { user: { name: string } };
    expect(user.name).toMatch(/^evil n+$/);
    expect(user.name.length).toBeLessThanOrEqual(60);
  });

  test("falls back to the GitHub login when there is no display name", async () => {
    const { session } = await signIn("github", { login: "ravi-k", name: null });
    const me = await call("/auth/me", {
      headers: {
        cookie: cookieHeader({ "__Host-handit_session": session["__Host-handit_session"] ?? "" }),
      },
    });
    expect(((await me.json()) as { user: { name: string } }).user.name).toBe("ravi-k");
  });

  test.each([
    [
      "a wrong state",
      (s: { state: string; cookies: Record<string, string> }) => ({
        state: "x".repeat(43),
        cookie: cookieHeader(s.cookies),
      }),
    ],
    ["no pending sign-in cookie", (s: { state: string }) => ({ state: s.state, cookie: "" })],
    [
      "a tampered cookie",
      (s: { state: string; cookies: Record<string, string> }) => ({
        state: s.state,
        cookie: cookieHeader({
          "__Host-handit_oauth": `${s.cookies["__Host-handit_oauth"]?.slice(0, -3)}AAA`,
        }),
      }),
    ],
    [
      "a cookie signed with another secret",
      async (s: { state: string }) => {
        const other = await start("github", {
          ...env,
          SESSION_SECRET: "another-secret-another-secret-another-1",
        });
        return { state: s.state, cookie: cookieHeader(other.cookies) };
      },
    ],
  ])("refused: %s", async (_, make) => {
    const seen = fakeProvider({ login: "ravi" });
    const pending = await start("github");
    const state = pending.location.searchParams.get("state") ?? "";
    const { state: q, cookie } = await make({ state, cookies: pending.cookies });
    const callback = await call(`/auth/github/callback?code=c&state=${q}`, { headers: { cookie } });
    expect(callback.headers.get("location")).toBe("/signin?error=1");
    expect(Object.keys(cookiesOf(callback)).filter((k) => k.includes("session"))).toEqual([]);
    expect(seen).toEqual([]); // the provider was never asked
  });

  test("a sign-in left pending for over 10 minutes is refused", async () => {
    const pending = await start("github");
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ["Date"] });
    const callback = await call(
      `/auth/github/callback?code=c&state=${pending.location.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(pending.cookies) } },
    );
    vi.useRealTimers();
    expect(callback.headers.get("location")).toBe("/signin?error=1");
  });

  test("the user cancelling at the provider, or the provider failing, signs nobody in", async () => {
    const pending = await start("github");
    const denied = await call(
      `/auth/github/callback?error=access_denied&state=${pending.location.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(pending.cookies) } },
    );
    expect(denied.headers.get("location")).toBe("/signin?error=1");

    fakeProvider({}, { tokenFails: true });
    const again = await start("github");
    const failed = await call(
      `/auth/github/callback?code=c&state=${again.location.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(again.cookies) } },
    );
    expect(failed.headers.get("location")).toBe("/signin?error=1");
    expect(Object.keys(cookiesOf(failed)).filter((k) => k.includes("session"))).toEqual([]);
  });

  test("a code can't be replayed: the pending cookie is single-use by its state and time", async () => {
    const { callback } = await signIn("github", { login: "ravi" });
    expect(callback.status).toBe(302);
    // A second callback arrives with the cleared cookie (as a browser would send it).
    const replay = await call("/auth/github/callback?code=c&state=whatever", {
      headers: { cookie: "__Host-handit_oauth=" },
    });
    expect(replay.headers.get("location")).toBe("/signin?error=1");
  });
});

describe("the session", () => {
  const sessionCookie = async (e: AuthEnv = env) => {
    const seenBefore = vi.isMockFunction(globalThis.fetch);
    if (seenBefore) vi.restoreAllMocks();
    fakeProvider({ login: "ravi", name: "Ravi" });
    const pending = await start("github", e);
    const callback = await call(
      `/auth/github/callback?code=c&state=${pending.location.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(pending.cookies) } },
      e,
    );
    return cookiesOf(callback)["__Host-handit_session"] ?? "";
  };
  const me = async (token: string, e: AuthEnv = env) =>
    (await (
      await call("/auth/me", { headers: { cookie: `__Host-handit_session=${token}` } }, e)
    ).json()) as { user: unknown };

  test("no cookie means signed out", async () => {
    expect(await (await call("/auth/me")).json()).toEqual({
      user: null,
      providers: { github: true, google: true },
    });
  });

  test("a changed or foreign session is signed out", async () => {
    const token = await sessionCookie();
    expect((await me(token)).user).not.toBeNull();
    expect((await me(`${token.slice(0, -2)}AA`)).user).toBeNull();
    const [payload = "", signature = ""] = token.split(".");
    const forged = btoa(
      JSON.stringify({ v: 1, p: "github", n: "Admin", iat: 1, exp: 9_999_999_999 }),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect((await me(`${forged}.${signature}`)).user).toBeNull();
    expect((await me(payload)).user).toBeNull();
    expect(
      (await me(token, { ...env, SESSION_SECRET: "another-secret-another-secret-another-1" })).user,
    ).toBeNull();
  });

  test("a session expires after 7 days", async () => {
    const token = await sessionCookie();
    vi.useFakeTimers({ now: Date.now() + 6 * 24 * 3600_000, toFake: ["Date"] });
    expect((await me(token)).user).not.toBeNull();
    vi.useFakeTimers({ now: Date.now() + 2 * 24 * 3600_000, toFake: ["Date"] });
    expect((await me(token)).user).toBeNull();
    vi.useRealTimers();
  });

  test("a pending sign-in cookie is not a session", async () => {
    // Anyone can start a sign-in and receive a genuinely signed "pending" cookie. Sent back as a
    // session, it must not count as being signed in.
    const pending = await start("github");
    expect((await me(pending.cookies["__Host-handit_oauth"] ?? "")).user).toBeNull();
  });

  test("one call tells the page who is signed in and which providers are on offer", async () => {
    expect(
      await (await call("/auth/me", {}, { ...env, GOOGLE_CLIENT_ID: undefined })).json(),
    ).toEqual({
      user: null,
      providers: { github: true, google: false },
    });
  });

  test("the session cookie is HttpOnly, Secure and SameSite=Lax", async () => {
    fakeProvider({ login: "ravi" });
    const pending = await start("github");
    const callback = await call(
      `/auth/github/callback?code=c&state=${pending.location.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(pending.cookies) } },
    );
    const header =
      callback.headers.getSetCookie().find((c) => c.startsWith("__Host-handit_session=")) ?? "";
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(header).toMatch(/Max-Age=604800/);
  });
});

describe("calls to the provider", () => {
  const callbackWith = async (respond: (url: string) => Response) => {
    const calls: { url: string; signal?: AbortSignal | null }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, signal: init?.signal });
      return respond(url);
    });
    const { location, cookies } = await start("github");
    const response = await call(
      `/auth/github/callback?code=c&state=${location.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(cookies) } },
    );
    return { calls, response };
  };

  test("each call has a time limit, so a slow provider can't hold the Worker", async () => {
    const { calls } = await callbackWith((url) =>
      /access_token/.test(url)
        ? new Response(JSON.stringify({ access_token: "t" }))
        : new Response(JSON.stringify({ login: "ravi" })),
    );
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c.signal).toBeInstanceOf(AbortSignal);
  });

  test("an error status from the provider fails the sign-in, even with a body that looks fine", async () => {
    const { response } = await callbackWith((url) =>
      /access_token/.test(url)
        ? new Response(JSON.stringify({ access_token: "t" }), { status: 500 })
        : new Response(JSON.stringify({ login: "ravi" })),
    );
    expect(response.headers.get("location")).toBe("/signin?error=1");
    expect(Object.keys(cookiesOf(response))).not.toContain("__Host-handit_session");
  });

  test("a failing profile request fails the sign-in too", async () => {
    const { response } = await callbackWith((url) =>
      /access_token/.test(url)
        ? new Response(JSON.stringify({ access_token: "t" }))
        : new Response(JSON.stringify({ login: "ravi" }), { status: 503 }),
    );
    expect(response.headers.get("location")).toBe("/signin?error=1");
  });
});

describe("signing out", () => {
  test("a POST from the site clears the cookie", async () => {
    const response = await call("/auth/logout", { method: "POST", headers: { origin: ORIGIN } });
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie().join()).toMatch(/__Host-handit_session=;.*Max-Age=0/);
  });

  test("a request from another site can't sign you out, and a GET does nothing", async () => {
    expect(
      (await call("/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } }))
        .status,
    ).toBe(403);
    expect((await call("/auth/logout", { method: "GET" })).status).toBe(405);
  });
});

describe("responses", () => {
  test("carry the security headers and are never cached", async () => {
    for (const path of ["/auth/providers", "/auth/me", "/auth/github/start", "/auth/nope/start"]) {
      const response = await call(path);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("content-security-policy"), path).toContain("default-src 'self'");
    }
  });

  test("the client secret never appears in a response", async () => {
    const { response } = await start("github");
    expect(JSON.stringify([...response.headers])).not.toContain("secret-VALUE");
    const { callback } = await signIn("github", { login: "ravi" });
    expect(JSON.stringify([...callback.headers])).not.toContain("secret-VALUE");
  });
});
