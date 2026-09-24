import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseActivityRepository as ActivityRepoClass } from "../database-activity-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";
import type { ActivityService as ActivityServiceClass } from "../../service/activity-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-activity-isolation-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseActivityRepository: typeof ActivityRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
let ActivityService: typeof ActivityServiceClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_activity_isolation_a";
const BUSINESS_B = "biz_activity_isolation_b";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  setupDb.prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(BUSINESS_A, "Business A", now, now);
  setupDb.prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(BUSINESS_B, "Business B", now, now);
  setupDb.prepare(
    "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("user_a", BUSINESS_A, "User A", "a@example.com", "hash", "staff", now, now);
  setupDb.prepare(
    "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("user_b", BUSINESS_B, "User B", "b@example.com", "hash", "staff", now, now);
  setupDb.close();

  const activityRepoModule = await import("../database-activity-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const leadRepoModule = await import("../../../leads/repository/database-lead-repository");
  const activityServiceModule = await import("../../service/activity-service");
  DatabaseActivityRepository = activityRepoModule.DatabaseActivityRepository;
  DatabaseCustomerRepository = customerRepoModule.DatabaseCustomerRepository;
  DatabaseLeadRepository = leadRepoModule.DatabaseLeadRepository;
  ActivityService = activityServiceModule.ActivityService;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

function makeContext(businessId: string) {
  const customerRepo = new DatabaseCustomerRepository(businessId);
  const leadRepo = new DatabaseLeadRepository(businessId);
  const activityRepo = new DatabaseActivityRepository(businessId);
  const activityService = new ActivityService(activityRepo, customerRepo, leadRepo);
  return { customerRepo, leadRepo, activityRepo, activityService };
}

let a: ReturnType<typeof makeContext>;
let b: ReturnType<typeof makeContext>;

beforeEach(() => {
  rawDb.exec("DELETE FROM activities; DELETE FROM leads; DELETE FROM customers;");
  a = makeContext(BUSINESS_A);
  b = makeContext(BUSINESS_B);
});

describe("Activity business isolation (Mission 017)", () => {
  it("business B cannot create an activity against business A's customer", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000001" });

    const result = await b.activityService.createActivity({
      customerId: customerA.id,
      userId: "user_b",
      type: "note",
      content: "Attempted cross-business note.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("business B cannot create an activity against business A's lead (even with A's own customerId)", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000002" });
    const leadA = await a.leadRepo.createLead({ customerId: customerA.id });

    const result = await b.activityService.createActivity({
      customerId: customerA.id,
      leadId: leadA.id,
      userId: "user_b",
      type: "note",
      content: "Attempted cross-business note.",
    });
    // customerId resolves to nothing in B's scope first — fails closed
    // the same way regardless of which id an attacker tries.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("business B's customer timeline never includes business A's activities, even with A's customerId directly", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000003" });
    await a.activityService.createActivity({ customerId: customerA.id, userId: "user_a", type: "note", content: "A's note" });

    const result = await b.activityRepo.getActivitiesPaged({ customerId: customerA.id, page: 1, pageSize: 10 });
    expect(result.total).toBe(0);
  });

  it("business B's lead timeline never includes business A's activities, even with A's leadId directly", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000004" });
    const leadA = await a.leadRepo.createLead({ customerId: customerA.id });
    await a.activityService.createActivity({ customerId: customerA.id, leadId: leadA.id, userId: "user_a", type: "note", content: "A's note" });

    const result = await b.activityRepo.getActivitiesPaged({ leadId: leadA.id, page: 1, pageSize: 10 });
    expect(result.total).toBe(0);
  });

  it("business B cannot read a specific business A activity by id", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000005" });
    const created = await a.activityService.createActivity({ customerId: customerA.id, userId: "user_a", type: "note", content: "A's note" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await b.activityRepo.getActivityById(created.data.id);
    expect(result).toBeNull();
  });

  it("a freshly created activity is always stamped with the constructing repository's businessId", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000006" });
    const created = await a.activityService.createActivity({ customerId: customerA.id, userId: "user_a", type: "note", content: "note" });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.data.businessId).toBe(BUSINESS_A);
  });
});

describe("Actor security (Mission 017)", () => {
  it("the persisted actor is exactly the userId the caller resolved server-side — nothing from a manual-entry request body can change it", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Customer A", phone: "0700000007" });

    // createManualActivity's input type has no userId field at all —
    // this proves the persisted actor is always the second (server-
    // resolved) argument, never anything the "request" could smuggle in.
    const result = await a.activityService.createManualActivity(
      { customerId: customerA.id, type: "note", content: "Logged by staff." },
      "user_a"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.userId).toBe("user_a");
  });
});
