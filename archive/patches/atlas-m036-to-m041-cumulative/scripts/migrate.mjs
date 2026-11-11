// Mission 037 — runs at container start: applies SQL migrations, then one-time data upgrades.
import { createHash } from "node:crypto";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const raw = process.env.DATABASE_URL ?? "file:/data/atlas.db";
const path = raw.startsWith("file:") ? raw.slice(5) : raw;
const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
migrate(drizzle(sqlite), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./migrations" });

// Upgrade pre-0021 plaintext public API keys to hash + hint. Must stay byte-compatible with
// src/lib/security/api-key.ts (sha256 hex; hint = prefix + first4…last4). Idempotent.
const legacy = sqlite.prepare("SELECT id, public_api_key AS key FROM businesses WHERE public_api_key IS NOT NULL").all();
const upgrade = sqlite.prepare(
  "UPDATE businesses SET public_api_key_hash = ?, public_api_key_hint = ?, public_api_key = NULL WHERE id = ?"
);
for (const { id, key } of legacy) {
  const prefix = "wego_live_";
  const body = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  upgrade.run(createHash("sha256").update(key, "utf8").digest("hex"), `${prefix}${body.slice(0, 4)}…${body.slice(-4)}`, id);
}
if (legacy.length > 0) console.log(`[migrate] hashed ${legacy.length} legacy public API key(s)`);

// Plaintext channel tokens are re-encrypted lazily by the app (it holds the crypto + key);
// just surface that any exist so an operator can see it.
const plainTokens = sqlite
  .prepare("SELECT COUNT(*) AS n FROM marketing_channel_connections WHERE access_token IS NOT NULL AND access_token NOT LIKE 'enc:v1:%'")
  .get().n;
if (plainTokens > 0) console.log(`[migrate] ${plainTokens} channel token(s) still plaintext; they are encrypted on next use (needs ATLAS_ENCRYPTION_KEY).`);

sqlite.close();
console.log(`[migrate] ok -> ${path}`);
