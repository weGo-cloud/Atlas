// Mission 037 — the implementation moved to src/lib/security/rate-limit.ts
// so every public surface shares one limiter. Re-exported for existing imports.
export { checkRateLimit, resetRateLimit, resetRateLimitsForTests } from "@/lib/security/rate-limit";
