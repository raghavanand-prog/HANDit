// Optional sign-in with GitHub or Google. Nothing here is required to send or receive files.
//
// Stateless on purpose: the server stores nothing. A signed cookie holds the person's name and the
// provider, and nothing else (no email, no picture, no provider id). The sign-in itself follows the
// standard authorization-code flow with `state` and PKCE; the provider's secret never leaves the
// server. Sign-in is switched off entirely unless a provider and a strong SESSION_SECRET are set.
import { SECURITY_HEADERS } from "./headers";

export interface AuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** At least 32 characters of randomness; signs the cookies. */
  SESSION_SECRET?: string;
  /** Local tests only: a fake provider's address, set on the test server's command line. */
  OAUTH_BASE_URL?: string;
}

type Provider = "github" | "google";
const PROVIDERS: Provider[] = ["github", "google"];

const SESSION_DAYS = 30;
const PENDING_SECONDS = 600;
const MAX_NAME = 60;

interface ProviderConfig {
  authorize: string;
  token: string;
  profile: string;
  scope: string;
  id?: string;
  secret?: string;
}

function configFor(provider: Provider, env: AuthEnv): ProviderConfig {
  const test = env.OAUTH_BASE_URL;
  if (provider === "github") {
    return {
      authorize: `${test ?? "https://github.com"}/login/oauth/authorize`,
      token: `${test ?? "https://github.com"}/login/oauth/access_token`,
      profile: test ? `${test}/user` : "https://api.github.com/user",
      scope: "read:user",
      id: env.GITHUB_CLIENT_ID,
      secret: env.GITHUB_CLIENT_SECRET,
    };
  }
  return {
    authorize: test ? `${test}/google/authorize` : "https://accounts.google.com/o/oauth2/v2/auth",
    token: test ? `${test}/google/token` : "https://oauth2.googleapis.com/token",
    profile: test ? `${test}/google/userinfo` : "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid profile",
    id: env.GOOGLE_CLIENT_ID,
    secret: env.GOOGLE_CLIENT_SECRET,
  };
}

const strongSecret = (env: AuthEnv) => (env.SESSION_SECRET?.length ?? 0) >= 32;
const configured = (provider: Provider, env: AuthEnv) =>
  strongSecret(env) && !!configFor(provider, env).id && !!configFor(provider, env).secret;

// ---------------------------------------------------------------------------------------------
// Small crypto helpers: base64url, HMAC-signed tokens, PKCE.

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function unb64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ]);

/** payload.signature, where the signature is HMAC-SHA-256 over the payload. */
async function sign(value: object, secret: string): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(payload),
  );
  return `${payload}.${b64url(new Uint8Array(signature))}`;
}

/** The signed value if the signature is genuine and it hasn't expired (`exp`, in seconds). */
async function verify<T extends { exp: number }>(token: string, secret: string): Promise<T | null> {
  const [payload = "", signature = "", extra] = token.split(".");
  if (extra !== undefined || !payload || !signature) return null;
  const sig = unb64url(signature);
  if (!sig) return null;
  const genuine = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    sig,
    encoder.encode(payload),
  );
  if (!genuine) return null;
  try {
    const bytes = unb64url(payload);
    if (!bytes) return null;
    const value = JSON.parse(new TextDecoder().decode(bytes)) as T;
    return typeof value.exp === "number" && value.exp > Date.now() / 1000 ? value : null;
  } catch {
    return null;
  }
}

async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

// ---------------------------------------------------------------------------------------------
// Cookies

const secure = (url: URL) => url.protocol === "https:";
// "__Host-" cookies can't be set by a sibling subdomain or overwritten over plain HTTP.
const cookieName = (url: URL, name: string) => (secure(url) ? `__Host-${name}` : name);

function setCookie(url: URL, name: string, value: string, maxAge: number): string {
  return [
    `${cookieName(url, name)}=${value}`,
    "Path=/",
    "HttpOnly",
    ...(secure(url) ? ["Secure"] : []),
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function readCookie(request: Request, url: URL, name: string): string {
  const wanted = `${cookieName(url, name)}=`;
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(wanted)) return trimmed.slice(wanted.length);
  }
  return "";
}

// ---------------------------------------------------------------------------------------------
// Responses

const NO_STORE = { ...SECURITY_HEADERS, "Cache-Control": "no-store" };

/** A plain-text response that is never cached. */
const text = (body: string, status: number) => new Response(body, { status, headers: NO_STORE });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE, "Content-Type": "application/json" },
  });

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers(NO_STORE);
  headers.set("Location", location);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

const failure = (url: URL, extra: string[] = []) =>
  redirect("/signin?error=1", [setCookie(url, "handit_oauth", "", 0), ...extra]);

/** A display name with control, invisible and bidirectional characters removed, and a length limit. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const kept = [...raw.normalize("NFC")].filter((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return !(
      c < 0x20 ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069) ||
      c === 0xfeff
    );
  });
  return kept.join("").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

// ---------------------------------------------------------------------------------------------
// The routes

interface Pending {
  s: string; // state
  v: string; // PKCE verifier
  p: Provider;
  exp: number;
}
interface Session {
  v: 1;
  p: Provider;
  n: string;
  iat: number;
  exp: number;
}

/** Handles /auth/*. Returns null for any other path. */
export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/auth/")) return null;
  const parts = url.pathname.split("/").filter(Boolean); // ["auth", ...]
  const secret = env.SESSION_SECRET ?? "";

  if (url.pathname === "/auth/providers" && request.method === "GET") {
    return json({ github: configured("github", env), google: configured("google", env) });
  }

  if (url.pathname === "/auth/me" && request.method === "GET") {
    const token = readCookie(request, url, "handit_session");
    const session = strongSecret(env) && token ? await verify<Session>(token, secret) : null;
    // One request tells the page everything it needs: who is signed in, and what is on offer.
    return json({
      user: session ? { name: session.n, provider: session.p } : null,
      providers: { github: configured("github", env), google: configured("google", env) },
    });
  }

  if (url.pathname === "/auth/logout") {
    if (request.method !== "POST") return text("Method not allowed", 405);
    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== url.origin) return text("Forbidden", 403);
    const headers = new Headers(NO_STORE);
    headers.append("Set-Cookie", setCookie(url, "handit_session", "", 0));
    return new Response(null, { status: 204, headers });
  }

  const provider = parts[1] as Provider;
  if (parts.length === 3 && PROVIDERS.includes(provider) && request.method === "GET") {
    if (!configured(provider, env)) return text("Not found", 404);
    if (parts[2] === "start") return start(url, provider, env);
    if (parts[2] === "callback") return callback(request, url, provider, env);
  }
  return text("Not found", 404);
}

async function start(url: URL, provider: Provider, env: AuthEnv): Promise<Response> {
  const config = configFor(provider, env);
  const state = randomToken();
  const verifier = randomToken();
  const pending: Pending = {
    s: state,
    v: verifier,
    p: provider,
    exp: Math.floor(Date.now() / 1000) + PENDING_SECONDS,
  };

  const target = new URL(config.authorize);
  target.searchParams.set("client_id", config.id ?? "");
  target.searchParams.set("redirect_uri", `${url.origin}/auth/${provider}/callback`);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", config.scope);
  target.searchParams.set("state", state);
  target.searchParams.set("code_challenge", await challengeFor(verifier));
  target.searchParams.set("code_challenge_method", "S256");
  return redirect(target.href, [
    setCookie(url, "handit_oauth", await sign(pending, env.SESSION_SECRET ?? ""), PENDING_SECONDS),
  ]);
}

async function callback(
  request: Request,
  url: URL,
  provider: Provider,
  env: AuthEnv,
): Promise<Response> {
  const secret = env.SESSION_SECRET ?? "";
  const pending = await verify<Pending>(readCookie(request, url, "handit_oauth"), secret);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  // The pending sign-in must be ours, recent, for this provider, and match the state the
  // provider sent back; the user cancelling at the provider arrives as ?error=.
  if (
    !pending ||
    pending.p !== provider ||
    !state ||
    pending.s !== state ||
    !code ||
    url.searchParams.has("error")
  ) {
    return failure(url);
  }

  try {
    const config = configFor(provider, env);
    const exchange = await fetch(config.token, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${url.origin}/auth/${provider}/callback`,
        client_id: config.id ?? "",
        client_secret: config.secret ?? "",
        code_verifier: pending.v,
      }).toString(),
    });
    const { access_token } = (await exchange.json()) as { access_token?: string };
    if (typeof access_token !== "string" || !access_token) return failure(url);

    const me = await fetch(config.profile, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
        "User-Agent": "HANDit",
      },
    });
    const profile = (await me.json()) as Record<string, unknown>;
    // Only a display name is kept. The email, picture and provider id are never read.
    const name =
      provider === "github"
        ? cleanName(profile.name) || cleanName(profile.login)
        : cleanName(profile.name) || cleanName(profile.given_name);
    if (!name) return failure(url);

    const now = Math.floor(Date.now() / 1000);
    const session: Session = {
      v: 1,
      p: provider,
      n: name,
      iat: now,
      exp: now + SESSION_DAYS * 86400,
    };
    return redirect("/", [
      setCookie(url, "handit_oauth", "", 0),
      setCookie(url, "handit_session", await sign(session, secret), SESSION_DAYS * 86400),
    ]);
  } catch {
    return failure(url);
  }
}
