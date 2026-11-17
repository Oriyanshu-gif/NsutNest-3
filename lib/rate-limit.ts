/**
 * Fixed-window rate limiting for the IMS routes.
 *
 * This is deliberately dependency-free. On Vercel each serverless instance keeps
 * its own memory, so the limit applies per instance rather than globally: it is a
 * guard against runaway retry loops and credential-stuffing bursts, not a
 * distributed quota. A globally consistent limit would need a shared store.
 */

type Bucket = { count: number; resetAt: number };

export type RateLimitOptions = {
  /** Allowed requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock, used by the tests. */
  now?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the current window resets; 0 when the request is allowed. */
  retryAfterSeconds: number;
};

/** Enough room for real users, bounded so a leaky map cannot grow forever. */
const MAX_BUCKETS = 5000;

const buckets = new Map<string, Bucket>();

function purge(store: Map<string, Bucket>, now: number) {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
  // Map iterates in insertion order, so the first keys are the oldest.
  while (store.size > MAX_BUCKETS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function rateLimit(
  key: string,
  options: RateLimitOptions,
  store: Map<string, Bucket> = buckets,
): RateLimitResult {
  const now = options.now ?? Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    if (store.size > MAX_BUCKETS) purge(store, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count > options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client identity for rate limiting. Behind Vercel the first
 * `x-forwarded-for` hop is the client; the others are proxies.
 */
export function requestKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
