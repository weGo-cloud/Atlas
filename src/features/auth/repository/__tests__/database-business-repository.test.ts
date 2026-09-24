import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

  it("also creates a subscription row for the new business, on the starter plan, active", async () => {
    const repo = new DatabaseBusinessRepository();
    const business = await repo.create({ name: "New Dealer 2" });

    const row = rawDb.prepare("SELECT plan, status FROM subscriptions WHERE business_id = ?").get(business.id) as
      | { plan: string; status: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.plan).toBe("starter");
    expect(row?.status).toBe("active");
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
    await repo.updateSettings(business.id, { publicApiKey: "test-key-123" });

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
