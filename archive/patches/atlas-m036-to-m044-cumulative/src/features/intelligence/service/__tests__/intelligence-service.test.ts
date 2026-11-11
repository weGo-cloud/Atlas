import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IntelligenceService as IntelligenceServiceClass } from "../intelligence-service";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import { ALL_TIME_RANGE } from "../../domain/__tests__/fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-intelligence-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let getIntelligenceService: (businessId: string) => InstanceType<typeof IntelligenceServiceClass>;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
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

  getIntelligenceService = (await import("../index")).getIntelligenceService;
  DatabaseCustomerRepository = (await import("../../../customers/repository/database-customer-repository"))
    .DatabaseCustomerRepository;

  rawDb = new Database(testDbPath);
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("biz_test", "Test Business", now, now);
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("biz_other", "Other Business", now, now);
  rawDb.pragma("foreign_keys = ON");
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

function seedLead(businessId: string, customerId: string, status = "new", nextFollowUpAt: string | null = null) {
  const id = nextId("lead");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO leads (id, business_id, customer_id, vehicle_id, vehicle_label, status, next_follow_up_at, last_contacted_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL, '', ?, ?)`
    )
    .run(id, businessId, customerId, status, nextFollowUpAt, now, now);
  return { id };
}

function seedDeal(businessId: string, customerId: string, leadId: string, status: string, agreedPrice: number) {
  const id = nextId("deal");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, '', ?, ?)`
    )
    .run(id, businessId, customerId, leadId, status, agreedPrice, now, now);
  return { id };
}

describe("IntelligenceService", () => {
  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
  });

  it("produces no signals against a quiet business with minimal data", async () => {
    const service = getIntelligenceService("biz_test");
    const result = await service.getIntelligence(ALL_TIME_RANGE);

    expect(result.signals).toEqual([]);
    expect(result.summary.totalSignals).toBe(0);
    expect(result.summary.highestSeverity).toBeNull();
    expect(result.timeRange).toEqual(ALL_TIME_RANGE);
  });

  it("surfaces completed_deals_awaiting_sale when a completed Deal has no Sale record", async () => {
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = seedLead("biz_test", customer.id);
    seedDeal("biz_test", customer.id, lead.id, "completed", 1_000_000);

    const service = getIntelligenceService("biz_test");
    const result = await service.getIntelligence(ALL_TIME_RANGE);

    const signal = result.signals.find((s) => s.type === "completed_deals_awaiting_sale");
    expect(signal).toBeDefined();
    expect(signal?.severity).toBe("WARNING");
    expect(result.summary.highestSeverity).toBe("WARNING");
  });

  it("never leaks another business's signals (cross-business isolation)", async () => {
    // biz_other has plenty of completed-deal-without-sale conditions.
    const otherCustomerRepo = new DatabaseCustomerRepository("biz_other");
    const otherCustomer = await otherCustomerRepo.createCustomer({ name: "Other", phone: "0711111111" });
    for (let i = 0; i < 5; i++) {
      const lead = seedLead("biz_other", otherCustomer.id);
      seedDeal("biz_other", otherCustomer.id, lead.id, "completed", 500_000);
    }

    const service = getIntelligenceService("biz_test");
    const result = await service.getIntelligence(ALL_TIME_RANGE);

    expect(result.signals).toEqual([]);
  });

  it("is deterministic — evaluating the same underlying data twice yields the same signals (ignoring generatedAt)", async () => {
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "B", phone: "0700000002" });
    const lead = seedLead("biz_test", customer.id);
    seedDeal("biz_test", customer.id, lead.id, "completed", 750_000);

    const service = getIntelligenceService("biz_test");
    const now = "2026-09-02T12:00:00.000Z";
    const a = await service.getIntelligence(ALL_TIME_RANGE, now);
    const b = await service.getIntelligence(ALL_TIME_RANGE, now);

    expect(a).toEqual(b);
  });
});
