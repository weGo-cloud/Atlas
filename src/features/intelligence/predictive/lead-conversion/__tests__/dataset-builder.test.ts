import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseLeadRepository as LeadRepoClass } from "../../../../leads/repository/database-lead-repository";
import type { DatabaseActivityRepository as ActivityRepoClass } from "../../../../activities/repository/database-activity-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../../customers/repository/database-customer-repository";
import { buildLeadConversionDataset } from "../dataset-builder";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-lead-conversion-dataset-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseLeadRepository: typeof LeadRepoClass;
let DatabaseActivityRepository: typeof ActivityRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let rawDb: Database.Database;

const BIZ_A = "biz_test";
const BIZ_B = "biz_other";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  setupDb.prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(BIZ_A, "A", now, now);
  setupDb.prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(BIZ_B, "B", now, now);
  setupDb
    .prepare(
      "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run("user_a", BIZ_A, "User A", "a@example.com", "hash", "staff", now, now);
  setupDb
    .prepare(
      "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run("user_b", BIZ_B, "User B", "b@example.com", "hash", "staff", now, now);
  setupDb.close();

  DatabaseLeadRepository = (await import("../../../../leads/repository/database-lead-repository")).DatabaseLeadRepository;
  DatabaseActivityRepository = (await import("../../../../activities/repository/database-activity-repository"))
    .DatabaseActivityRepository;
  DatabaseCustomerRepository = (await import("../../../../customers/repository/database-customer-repository"))
    .DatabaseCustomerRepository;

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

function backdateLead(leadId: string, createdAt: string) {
  rawDb.prepare("UPDATE leads SET created_at = ? WHERE id = ?").run(createdAt, leadId);
}

function seedActivity(opts: {
  businessId: string;
  customerId: string;
  leadId: string;
  userId: string;
  type: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}) {
  rawDb
    .prepare(
      `INSERT INTO activities (id, business_id, customer_id, lead_id, user_id, type, content, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)`
    )
    .run(nextId("activity"), opts.businessId, opts.customerId, opts.leadId, opts.userId, opts.type, opts.metadata ? JSON.stringify(opts.metadata) : null, opts.createdAt);
}

const NOW = "2026-09-02T00:00:00.000Z";

describe("buildLeadConversionDataset", () => {
  beforeEach(() => {
    rawDb.exec("DELETE FROM activities; DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM customers;");
  });

  it("excludes a lead created too recently for its label horizon to have resolved", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });

    const recentLead = await leadRepo.createLead({ customerId: customer.id });
    // Only 5 days before "now" — well short of the 30-day horizon.
    backdateLead(recentLead.id, "2026-08-28T00:00:00.000Z");

    const dataset = await buildLeadConversionDataset(leadRepo, activityRepo, NOW);
    expect(dataset).toEqual([]);
  });

  it("includes a fully-matured lead and computes its label from the activity log", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });

    const lead = await leadRepo.createLead({ customerId: customer.id });
    const createdAt = "2026-07-01T00:00:00.000Z"; // well over 30 days before NOW
    backdateLead(lead.id, createdAt);

    seedActivity({
      businessId: BIZ_A,
      customerId: customer.id,
      leadId: lead.id,
      userId: "user_a",
      type: "deal_status_changed",
      createdAt: "2026-07-10T00:00:00.000Z", // within the 30-day horizon
      metadata: { dealId: "deal_1", fromStatus: "negotiating", toStatus: "completed" },
    });

    const dataset = await buildLeadConversionDataset(leadRepo, activityRepo, NOW);
    expect(dataset).toHaveLength(1);
    expect(dataset[0].label).toBe(1);
    expect(dataset[0].leadId).toBe(lead.id);
  });

  it("labels 0 when the completing event falls after the lead's own horizon, even though it's before `now`", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });

    const lead = await leadRepo.createLead({ customerId: customer.id });
    const createdAt = "2026-07-01T00:00:00.000Z";
    backdateLead(lead.id, createdAt);

    // Completes 90 days after creation — long after this lead's own 30-day horizon.
    seedActivity({
      businessId: BIZ_A,
      customerId: customer.id,
      leadId: lead.id,
      userId: "user_a",
      type: "deal_status_changed",
      createdAt: "2026-09-29T00:00:00.000Z",
      metadata: { dealId: "deal_1", fromStatus: "negotiating", toStatus: "completed" },
    });

    const dataset = await buildLeadConversionDataset(leadRepo, activityRepo, "2026-12-01T00:00:00.000Z");
    expect(dataset).toHaveLength(1);
    expect(dataset[0].label).toBe(0);
  });

  it("never mixes another business's leads/activities into the dataset", async () => {
    const leadRepoA = new DatabaseLeadRepository(BIZ_A);
    const activityRepoA = new DatabaseActivityRepository(BIZ_A);
    const leadRepoB = new DatabaseLeadRepository(BIZ_B);
    const customerRepoB = new DatabaseCustomerRepository(BIZ_B);
    const customerB = await customerRepoB.createCustomer({ name: "B", phone: "0711111111" });

    const leadB = await leadRepoB.createLead({ customerId: customerB.id });
    backdateLead(leadB.id, "2026-07-01T00:00:00.000Z");
    seedActivity({
      businessId: BIZ_B,
      customerId: customerB.id,
      leadId: leadB.id,
      userId: "user_b",
      type: "deal_status_changed",
      createdAt: "2026-07-10T00:00:00.000Z",
      metadata: { dealId: "deal_1", toStatus: "completed" },
    });

    const dataset = await buildLeadConversionDataset(leadRepoA, activityRepoA, NOW);
    expect(dataset).toEqual([]);
  });

  it("is deterministic across repeated builds against the same data", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = await leadRepo.createLead({ customerId: customer.id });
    backdateLead(lead.id, "2026-07-01T00:00:00.000Z");

    const a = await buildLeadConversionDataset(leadRepo, activityRepo, NOW);
    const b = await buildLeadConversionDataset(leadRepo, activityRepo, NOW);
    expect(a).toEqual(b);
  });
});
