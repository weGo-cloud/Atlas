/**
 * Mission 037 — shared in-memory fixed-window rate limiter (moved from
 * features/assistant/lib so login, the public API and the assistant all
 * use one implementation). Per-process state: correct for the single
 * instance Atlas deploys as (SQLite). A multi-instance deployment must
 * swap this for a shared store; call sites only depend on these functions.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Forgets a key (e.g. a successful login clears that account's failure window). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
