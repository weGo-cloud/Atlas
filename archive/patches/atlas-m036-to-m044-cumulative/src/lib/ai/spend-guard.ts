import { sql } from "drizzle-orm";

// The database is loaded lazily: importing this module (e.g. from an LLM client in a unit test, or during `next build`)
// must not open SQLite as a side effect.
async function getDb() {
  return (await import("@/lib/db/client")).db;
}

/**
 * Mission 037 — hard daily caps on paid AI calls, so a bug, a bot hammering
 * the unauthenticated storefront chat, or a leaked URL can't run up an
 * unbounded Anthropic bill. Fail-closed: when a cap is reached the call is
 * refused with an honest "limit reached" outcome (never a silent fallback).
 *
 * Counting is ONE guarded upsert per call (SQLite 3.35+ UPSERT ... RETURNING),
 * so concurrent requests can't overshoot a cap: the WHERE clause refuses the
 * increment atomically once `calls` has reached the limit.
 *
 * Scopes: "global" (every outbound Anthropic request) and `biz:<id>` (customer
 * messages handled for one business — the public, unauthenticated cost risk).
 */
export const DEFAULT_GLOBAL_DAILY_CAP = 2000;
export const DEFAULT_BUSINESS_DAILY_CAP = 500;

function envCap(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function globalDailyCap(): number {
  return envCap("AI_DAILY_CAP_GLOBAL", DEFAULT_GLOBAL_DAILY_CAP);
}

export function businessDailyCap(): number {
  return envCap("AI_DAILY_CAP_PER_BUSINESS", DEFAULT_BUSINESS_DAILY_CAP);
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Atomically reserves one call in `scope` for today (UTC). Returns false when the cap is already reached. */
export async function reserveAiCall(scope: string, cap: number, now: Date = new Date()): Promise<boolean> {
  if (cap <= 0) return false;
  const db = await getDb();
  const rows = db.all<{ calls: number }>(sql`
    INSERT INTO ai_usage_counters (scope, day, calls) VALUES (${scope}, ${dayKey(now)}, 1)
    ON CONFLICT (scope, day) DO UPDATE SET calls = calls + 1 WHERE calls < ${cap}
    RETURNING calls
  `);
  return rows.length > 0;
}

/** Mission 038 — calls already counted in `scope` for today (UTC), for usage meters and the operator script. */
export async function readAiUsage(scope: string, now: Date = new Date()): Promise<number> {
  const db = await getDb();
  const rows = db.all<{ calls: number }>(sql`SELECT calls FROM ai_usage_counters WHERE scope = ${scope} AND day = ${dayKey(now)}`);
  return rows[0]?.calls ?? 0;
}

/** Start of the next UTC day, when daily counters reset. */
export function nextUtcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export function reserveGlobalAiCall(now: Date = new Date()): Promise<boolean> {
  return reserveAiCall("global", globalDailyCap(), now);
}

export function reserveBusinessAiCall(businessId: string, now: Date = new Date()): Promise<boolean> {
  return reserveAiCall(`biz:${businessId}`, businessDailyCap(), now);
}
