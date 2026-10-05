import { isIPv6 } from 'node:net';
import type { RequestHandler } from 'express';

/** Distinct clients tracked per window. Past this, new clients share one bucket. */
const MAX_TRACKED = 10_000;

/**
 * One end user typically holds a whole IPv6 /64, so keying on the full
 * address would let them rotate past the limit. Bucket by the /64 prefix.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];
  if (!isIPv6(ip)) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * Fixed-window limiter with a per-client cap and a global ceiling. State is
 * per worker process, so with pm2's two workers the effective caps are up to
 * twice the configured values — fine for keeping one client (or a botnet)
 * from draining the shared Gemini quota.
 */
export function rateLimit(
  perMinute: number,
  globalPerMinute = perMinute * 20,
  windowMs = 60_000,
): RequestHandler {
  let hits = new Map<string, number>();
  let total = 0;
  let resetAt = Date.now() + windowMs;

  return (req, res, next) => {
    const now = Date.now();
    if (now >= resetAt) {
      // Fixed window: dropping the whole map also bounds its memory.
      hits = new Map();
      total = 0;
      resetAt = now + windowMs;
    }
    let key = clientKey(req.ip);
    if (!hits.has(key) && hits.size >= MAX_TRACKED) key = 'overflow';
    const count = (hits.get(key) ?? 0) + 1;
    // Rejected requests don't count toward the global total, so one client
    // hammering past its own cap can't lock everyone else out.
    const allowed = count <= perMinute && total < globalPerMinute;
    if (!allowed) {
      res.setHeader('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many requests', fallback: { action: 'unknown' } });
      return;
    }
    hits.set(key, count);
    total += 1;
    next();
  };
}
