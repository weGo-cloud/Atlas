import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseSubscriptionRepository as RepoClass } from "../database-subscription-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-subscription-repo-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseSubscriptionRepository: typeof RepoClass;
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

  DatabaseSubscriptionRepository = (await import("../database-subscription-repository")).DatabaseSubscriptionRepository;
  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}_${counter}`;
}

function seedBusiness(): string {
  const id = nextId("biz");
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(id, `Business ${id}`, now, now);
  return id;
}

beforeEach(() => {
  rawDb.exec("DELETE FROM subscriptions; DELETE FROM businesses;");
});

describe("DatabaseSubscriptionRepository", () => {
  it("returns null for a business with no subscription yet", async () => {
    const businessId = seedBusiness();
    const repo = new DatabaseSubscriptionRepository();
    expect(await repo.getByBusinessId(businessId)).toBeNull();
  });

  it("creates a subscription and reads it back", async () => {
    const businessId = seedBusiness();
    const repo = new DatabaseSubscriptionRepository();
    const created = await repo.create({ businessId, plan: "growth", status: "active" });

    expect(created.businessId).toBe(businessId);
    expect(created.plan).toBe("growth");
    expect(created.status).toBe("active");
    expect(created.cancelAtPeriodEnd).toBe(false);
    expect(created.provider).toBeNull();

    const fetched = await repo.getByBusinessId(businessId);
    expect(fetched).toEqual(created);
  });

  it("updates only the fields provided", async () => {
    const businessId = seedBusiness();
    const repo = new DatabaseSubscriptionRepository();
    await repo.create({ businessId, plan: "starter", status: "active" });

    const updated = await repo.update(businessId, { plan: "pro" });
    expect(updated?.plan).toBe("pro");
    expect(updated?.status).toBe("active"); // untouched

    const statusUpdated = await repo.update(businessId, { status: "past_due" });
    expect(statusUpdated?.plan).toBe("pro"); // untouched
    expect(statusUpdated?.status).toBe("past_due");
  });

  it("update returns null for a business with no subscription row", async () => {
    const businessId = seedBusiness();
    const repo = new DatabaseSubscriptionRepository();
    expect(await repo.update(businessId, { plan: "pro" })).toBeNull();
  });

  it("never returns another business's subscription (Mission 028, Section 18)", async () => {
    const businessA = seedBusiness();
    const businessB = seedBusiness();
    const repo = new DatabaseSubscriptionRepository();
    await repo.create({ businessId: businessA, plan: "starter", status: "active" });
    await repo.create({ businessId: businessB, plan: "pro", status: "active" });

    const forA = await repo.getByBusinessId(businessA);
    const forB = await repo.getByBusinessId(businessB);
    expect(forA?.plan).toBe("starter");
    expect(forB?.plan).toBe("pro");
    expect(forA?.id).not.toBe(forB?.id);
  });
});
