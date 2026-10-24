import { DurableObject } from "cloudflare:workers";

// Per-IP abuse limits: at most 20 new codes and 60 join attempts per 10 minutes.
// One Limiter per client IP keeps the times of recent attempts, nothing else,
// and deletes them 10 minutes after the last one.
export const WINDOW_MS = 10 * 60 * 1000;
export const LIMITS = { room: 20, join: 60 } as const;
export type LimitKind = keyof typeof LIMITS;

export class Limiter extends DurableObject<Env> {
  /** Records an attempt if it's within the limit, and says whether it was. */
  async allow(kind: LimitKind): Promise<boolean> {
    const now = Date.now();
    const recent = this.recent(kind, now);
    if (recent.length >= LIMITS[kind]) return false;
    this.ctx.storage.kv.put(kind, [...recent, now]);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + WINDOW_MS);
    }
    return true;
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const newest = Math.max(0, ...this.recent("room", now), ...this.recent("join", now));
    if (newest === 0) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(newest + WINDOW_MS);
  }

  private recent(kind: LimitKind, now: number): number[] {
    return (this.ctx.storage.kv.get<number[]>(kind) ?? []).filter((t) => t > now - WINDOW_MS);
  }
}

/** The address to count: IPv4 as is; IPv6 per /64, since one user usually controls a whole /64. */
export function clientKey(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP")?.toLowerCase();
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1); // IPv4-mapped IPv6

  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...new Array<string>(8 - left.length - right.length).fill("0"), ...right];
  const prefix = groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, ""));
  return `${prefix.join(":")}::/64`;
}
