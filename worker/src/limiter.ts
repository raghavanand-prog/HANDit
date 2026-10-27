import { DurableObject } from "cloudflare:workers";

// Per-IP abuse limits per 10 minutes: at most 100 new codes, 300 join attempts and 30 sign-in attempts.
// One Limiter per client IP keeps the times of recent attempts, nothing else,
// and deletes them 10 minutes after the last one.
export const WINDOW_MS = 10 * 60 * 1000;
export const LIMITS = { room: 100, join: 300, auth: 30 } as const;
export type LimitKind = keyof typeof LIMITS;

/** One /48 (what an ISP may hand to a single customer, 65,536 /64s) gets this many times a /64's limits. */
export const WIDE_SCALE = 10;

/**
 * The limits in force. LIMIT_MULTIPLIER exists for the automated browser tests, which create far
 * more codes from one machine than a person would. It is set only on the local test server's
 * command line, never in wrangler.jsonc, and it is honoured only for requests to localhost
 * (`local`), so even a value set by mistake on the live site changes nothing.
 */
export function limitsFor(
  env: { LIMIT_MULTIPLIER?: string },
  local = false,
): Record<LimitKind, number> {
  const asked = local ? Number(env.LIMIT_MULTIPLIER) : 1;
  const multiplier = Math.min(1000, Math.max(1, Math.floor(asked || 1)));
  return {
    room: LIMITS.room * multiplier,
    join: LIMITS.join * multiplier,
    auth: LIMITS.auth * multiplier,
  };
}

export class Limiter extends DurableObject<Env> {
  /** Records an attempt if it's within the limit (times `scale`), and says whether it was. */
  async allow(kind: LimitKind, local = false, scale = 1): Promise<boolean> {
    const now = Date.now();
    const recent = this.recent(kind, now);
    const limit = limitsFor(this.env as { LIMIT_MULTIPLIER?: string }, local)[kind] * scale;
    if (recent.length >= limit) return false;
    this.ctx.storage.kv.put(kind, [...recent, now]);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + WINDOW_MS);
    }
    return true;
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const newest = Math.max(
      0,
      ...(Object.keys(LIMITS) as LimitKind[]).flatMap((kind) => this.recent(kind, now)),
    );
    if (newest === 0) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(newest + WINDOW_MS);
  }

  private recent(kind: LimitKind, now: number): number[] {
    return (this.ctx.storage.kv.get<number[]>(kind) ?? []).filter((t) => t > now - WINDOW_MS);
  }
}

/** The eight 16-bit groups of an IPv6 address, as lower-case hex without leading zeros; null if it isn't one. */
function groupsOf(ip: string): string[] | null {
  if (!ip.includes(":") || ip.includes(".")) return null;
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = 8 - left.length - right.length;
  if (tail !== undefined && fill < 0) return null;
  const groups =
    tail === undefined ? left : [...left, ...new Array<string>(fill).fill("0"), ...right];
  return groups.length === 8 ? groups.map((g) => g.replace(/^0+(?=.)/, "")) : null;
}

/** The address to count: IPv4 as is; IPv6 per /64, since one user usually controls a whole /64. */
export function clientKey(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP")?.toLowerCase();
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1); // IPv4-mapped IPv6
  const groups = groupsOf(ip) ?? ip.split(":");
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/**
 * The wider bucket for an IPv6 client: its /48. An ISP can give one customer a /48 or /56, which
 * is thousands of /64s, each with its own count. null for IPv4 and for a missing address.
 */
export function wideKey(request: Request): string | null {
  const ip = request.headers.get("CF-Connecting-IP")?.toLowerCase();
  if (!ip || !ip.includes(":") || ip.includes(".")) return null;
  const groups = groupsOf(ip);
  return groups ? `${groups.slice(0, 3).join(":")}::/48` : null;
}
