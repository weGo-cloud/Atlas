/**
 * Tiny in-memory fixed-window rate limiter for the public chat endpoint.
 * Per-process state: fine for the single-node deployment Atlas targets
 * today; a multi-instance deployment should swap this for a shared
 * store (the call sites only depend on `checkRateLimit`).
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
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

export function resetRateLimitsForTests() {
  buckets.clear();
}
