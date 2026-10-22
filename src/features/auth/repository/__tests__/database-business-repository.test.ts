import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TRIAL_DAYS } from "../../../entitlements/domain/plan";
import type { DatabaseBusinessRepository as RepoClass } from "../database-business-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-business-repo-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseBusinessRepository: typeof RepoClass;
let rawDb: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  DatabaseBusinessRepository = (await import("../database-business-repository")).DatabaseBusinessRepository;
  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM subscriptions; DELETE FROM businesses;");
});

describe("DatabaseBusinessRepository.create (Mission 028)", () => {
  it("defaults a new business to websiteMode 'none' (Section 22 #18 — a no-website dealer is representable)", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "New Dealer" });
    expect(business.websiteMode).toBe("none");
  });

  // Mission 036 — a new business starts a full-feature trial (Pro, TRIAL_DAYS) instead of the old starter/active row; it falls back to free Starter when the trial ends.
  it("also creates a subscription row for the new business: a TRIAL_DAYS trial on the Pro plan", async () => {
    const before = Date.now();
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "New Dealer 2" });
    const after = Date.now();

    const row = rawDb
      .prepare("SELECT plan, status, trial_ends_at AS trialEndsAt FROM subscriptions WHERE business_id = ?")
      .get(business.id) as { plan: string; status: string; trialEndsAt: string | null } | undefined;
    expect(row).toBeDefined();
    expect(row?.plan).toBe("pro");
    expect(row?.status).toBe("trialing");
    const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const endsAt = new Date(row?.trialEndsAt ?? "").getTime();
    expect(endsAt).toBeGreaterThanOrEqual(before + trialMs);
    expect(endsAt).toBeLessThanOrEqual(after + trialMs);
  });
});

describe("Website strategy representation (Mission 028, Section 13/22 #17-19)", () => {
  it("can represent a dealer with an existing website (own_website)", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Has A Website" });
    const updated = await repo.updateSettings(business.id, { websiteMode: "own_website" });
    expect(updated?.websiteMode).toBe("own_website");
  });

  it("can represent a dealer with no website (none)", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "No Website" });
    expect(business.websiteMode).toBe("none");
  });

  it("can represent a dealer using the Atlas-hosted storefront (atlas_hosted)", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Atlas Hosted" });
    const updated = await repo.updateSettings(business.id, { websiteMode: "atlas_hosted" });
    expect(updated?.websiteMode).toBe("atlas_hosted");
  });

  it("all three website modes are represented by the same business/repository shape — no separate product architecture", async () => {
    const repo = new DatabaseBusinessRepository();
    const none = await repo.create({ name: "A" });
    const own = await repo.create({ name: "B" });
    await repo.updateSettings(own.id, { websiteMode: "own_website" });
    const hosted = await repo.create({ name: "C" });
    await repo.updateSettings(hosted.id, { websiteMode: "atlas_hosted" });

    // Same repository, same Business type, same getById — just a
    // different value of one field. This is the "new website offering
    // ≠ separate CRM/intelligence platform" property Section 26 asks
    // the architecture to have.
    for (const id of [none.id, own.id, hosted.id]) {
      const fetched = await repo.getById(id);
      expect(fetched).not.toBeNull();
      expect(typeof fetched?.websiteMode).toBe("string");
    }
  });
});

describe("getByPublicApiKey", () => {
  it("finds a business by its API key", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Keyed Dealer" });
    await repo.setPublicApiKey(business.id, "test-key-123");

    const found = await repo.getByPublicApiKey("test-key-123");
    expect(found?.id).toBe(business.id);
  });

  it("returns null for an unknown key", async () => {
    const repo = new DatabaseBusinessRepository();
    expect(await repo.getByPublicApiKey("nope")).toBeNull();
  });

  it("returns null for an empty key without querying (defensive)", async () => {
    const repo = new DatabaseBusinessRepository();
    expect(await repo.getByPublicApiKey("")).toBeNull();
  });
});

describe("Mission 037 — public API key hashing", () => {
  it("never stores the plaintext key; only hash + hint", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Hashed Dealer" });
    const key = "wego_live_" + "ab12" + "9".repeat(40) + "f3e0";
    const updated = await repo.setPublicApiKey(business.id, key);

    const row = rawDb.prepare("SELECT public_api_key, public_api_key_hash, public_api_key_hint FROM businesses WHERE id = ?").get(business.id) as {
      public_api_key: string | null;
      public_api_key_hash: string | null;
      public_api_key_hint: string | null;
    };
    expect(row.public_api_key).toBeNull();
    expect(row.public_api_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("9999999999");
    expect(row.public_api_key_hint).toBe("wego_live_ab12…f3e0");
    expect(updated?.publicApiKeyHint).toBe("wego_live_ab12…f3e0");
    // The domain object cannot carry the plaintext at all.
    expect(JSON.stringify(updated)).not.toContain("9999999999");
    expect((await repo.getByPublicApiKey(key))?.id).toBe(business.id);
  });

  it("rotation invalidates the old key; revoke invalidates everything", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Rotating Dealer" });
    await repo.setPublicApiKey(business.id, "key-one");
    await repo.setPublicApiKey(business.id, "key-two");
    expect(await repo.getByPublicApiKey("key-one")).toBeNull();
    expect((await repo.getByPublicApiKey("key-two"))?.id).toBe(business.id);

    const revoked = await repo.clearPublicApiKey(business.id);
    expect(revoked?.publicApiKeyHint).toBeNull();
    expect(await repo.getByPublicApiKey("key-two")).toBeNull();
  });

  it("a legacy plaintext key still authenticates once and is upgraded in place", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Legacy Dealer" });
    const legacyKey = "wego_live_" + "c0de" + "1".repeat(40) + "beef";
    rawDb.prepare("UPDATE businesses SET public_api_key = ? WHERE id = ?").run(legacyKey, business.id);

    expect((await repo.getByPublicApiKey(legacyKey))?.id).toBe(business.id);
    const row = rawDb.prepare("SELECT public_api_key, public_api_key_hash FROM businesses WHERE id = ?").get(business.id) as {
      public_api_key: string | null;
      public_api_key_hash: string | null;
    };
    expect(row.public_api_key).toBeNull();
    expect(row.public_api_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await repo.getByPublicApiKey(legacyKey))?.id).toBe(business.id); // still works after the upgrade
  });

  it("two businesses cannot share a key; lookups are business-exact", async () => {
    const repo = new DatabaseBusinessRepository();
    const a = await repo.create({ name: "A" });
    const b = await repo.create({ name: "B" });
    await repo.setPublicApiKey(a.id, "shared-attempt");
    await expect(repo.setPublicApiKey(b.id, "shared-attempt")).rejects.toThrow();
    expect((await repo.getByPublicApiKey("shared-attempt"))?.id).toBe(a.id);
  });

  it("persists allowed origins and clears them with an empty list", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "Origins Dealer" });
    const set = await repo.updateSettings(business.id, { publicApiAllowedOrigins: ["https://shop.co.ke"] });
    expect(set?.publicApiAllowedOrigins).toEqual(["https://shop.co.ke"]);
    const cleared = await repo.updateSettings(business.id, { publicApiAllowedOrigins: [] });
    expect(cleared?.publicApiAllowedOrigins).toEqual([]);
  });
});
