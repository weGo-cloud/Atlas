import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

/**
 * Resolves the SQLite file location from DATABASE_URL.
 *
 * Accepts the `file:./prisma-style` convention (`file:./dev.db`) as
 * well as a bare path, and resolves relative paths against the
 * project root so it behaves the same regardless of current working
 * directory.
 */
function resolveDatabasePath(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL, " +
        'e.g. DATABASE_URL="file:./db/dev.db"'
    );
  }

  const withoutScheme = raw.startsWith("file:") ? raw.slice(5) : raw;
  // turbopackIgnore: DATABASE_URL is dev-only config (never bundled
  // for a deployed serverless target — see README), so this resolved
  // path shouldn't trigger whole-project file tracing at build time.
  return path.isAbsolute(withoutScheme)
    ? withoutScheme
    : path.join(/* turbopackIgnore: true */ process.cwd(), withoutScheme);
}

// Reuse a single connection across Next.js dev-mode hot reloads —
// without this, every module reload would open a new SQLite file
// handle and eventually exhaust file descriptors.
const globalForDb = globalThis as unknown as {
  __atlasSqlite?: Database.Database;
};

function getConnection(): Database.Database {
  if (!globalForDb.__atlasSqlite) {
    const dbPath = resolveDatabasePath();
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    globalForDb.__atlasSqlite = sqlite;
  }
  return globalForDb.__atlasSqlite;
}

export const db = drizzle(getConnection(), { schema });
