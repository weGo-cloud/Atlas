import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ActivityService as ActivityServiceClass } from "../activity-service";
import type { DatabaseActivityRepository as ActivityRepoClass } from "../../repository/database-activity-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-activity-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let ActivityService: typeof ActivityServiceClass;
let DatabaseActivityRepository: typeof ActivityRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
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

  const serviceModule = await import("../activity-service");
  const activityRepoModule = await import("../../repository/database-activity-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const leadRepoModule = await import("../../../leads/repository/database-lead-repository");
  ActivityService = serviceModule.ActivityService;
  DatabaseActivityRepository = activityRepoModule.DatabaseActivityRepository;
  DatabaseCustomerRepository = customerRepoModule.DatabaseCustomerRepository;
  DatabaseLeadRepository = leadRepoModule.DatabaseLeadRepository;

  rawDb = new Database(testDbPath);
  rawDb.prepare(
    "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run("biz_test", "Test Business", new Date().toISOString(), new Date().toISOString());
  rawDb.prepare(
    "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("user_test", "biz_test", "Test User", "test@example.com", "hash", "staff", new Date().toISOString(), new Date().toISOString());
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

async function makeCustomer(repo: InstanceType<typeof CustomerRepoClass>, name = "Jane") {
  return repo.createCustomer({ name, phone: "0700000000" });
}

describe("ActivityService", () => {
  let service: InstanceType<typeof ActivityServiceClass>;
  let customerRepository: InstanceType<typeof CustomerRepoClass>;
  let leadRepository: InstanceType<typeof LeadRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM activities; DELETE FROM leads; DELETE FROM customers;");
    customerRepository = new DatabaseCustomerRepository("biz_test");
    leadRepository = new DatabaseLeadRepository("biz_test");
    service = new ActivityService(new DatabaseActivityRepository("biz_test"), customerRepository, leadRepository);
  });

  describe("createActivity (internal/trusted path)", () => {
    it("creates a customer-only activity (no lead)", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createActivity({
        customerId: customer.id,
        userId: "user_test",
        type: "note",
        content: "Called, left voicemail.",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.leadId).toBeNull();
        expect(result.data.userId).toBe("user_test");
      }
    });

    it("creates a lead-scoped activity when the lead belongs to the given customer", async () => {
      const customer = await makeCustomer(customerRepository);
      const lead = await leadRepository.createLead({ customerId: customer.id });
      const result = await service.createActivity({
        customerId: customer.id,
        leadId: lead.id,
        userId: "user_test",
        type: "status_change",
        content: "Status changed.",
        metadata: { fromStatus: "new", toStatus: "contacted" },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.leadId).toBe(lead.id);
        expect(result.data.metadata).toEqual({ fromStatus: "new", toStatus: "contacted" });
      }
    });

    it("rejects a missing customer", async () => {
      const result = await service.createActivity({
        customerId: "does-not-exist",
        userId: "user_test",
        type: "note",
        content: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it("rejects a missing lead", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createActivity({
        customerId: customer.id,
        leadId: "does-not-exist",
        userId: "user_test",
        type: "note",
        content: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("LEAD_NOT_FOUND");
    });

    it("rejects a lead that belongs to a different customer (mismatch)", async () => {
      const customerA = await makeCustomer(customerRepository, "A");
      const customerB = await makeCustomer(customerRepository, "B");
      const leadForA = await leadRepository.createLead({ customerId: customerA.id });

      const result = await service.createActivity({
        customerId: customerB.id,
        leadId: leadForA.id,
        userId: "user_test",
        type: "note",
        content: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("LEAD_CUSTOMER_MISMATCH");
    });

    it("rejects empty content", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createActivity({
        customerId: customer.id,
        userId: "user_test",
        type: "note",
        content: "   ",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("createManualActivity (client-facing path)", () => {
    it("accepts a manual type", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createManualActivity(
        { customerId: customer.id, type: "call", content: "Spoke on the phone." },
        "user_test"
      );
      expect(result.ok).toBe(true);
    });

    it("rejects an automatic type — cannot be forged through the manual path", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createManualActivity(
        { customerId: customer.id, type: "status_change", content: "Forged." },
        "user_test"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a garbage type string", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createManualActivity(
        { customerId: customer.id, type: "whatsapp", content: "x" },
        "user_test"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("always uses the passed actorUserId, never anything from input", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createManualActivity(
        { customerId: customer.id, type: "note", content: "x" },
        "user_test"
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.userId).toBe("user_test");
    });
  });

  describe("getActivitiesForCustomer / getActivitiesForLead", () => {
    it("returns a customer's activities newest-first, including lead-scoped ones", async () => {
      const customer = await makeCustomer(customerRepository);
      const lead = await leadRepository.createLead({ customerId: customer.id });

      await service.createActivity({ customerId: customer.id, userId: "user_test", type: "note", content: "first" });
      await service.createActivity({
        customerId: customer.id,
        leadId: lead.id,
        userId: "user_test",
        type: "note",
        content: "second (lead-scoped)",
      });

      const result = await service.getActivitiesForCustomer(customer.id, { page: 1, pageSize: 10 });
      expect(result.total).toBe(2);
      expect(result.items[0].content).toBe("second (lead-scoped)");
      expect(result.items[1].content).toBe("first");
    });

    it("getActivitiesForLead only returns that lead's activities", async () => {
      const customer = await makeCustomer(customerRepository);
      const leadA = await leadRepository.createLead({ customerId: customer.id });
      const leadB = await leadRepository.createLead({ customerId: customer.id });

      await service.createActivity({ customerId: customer.id, leadId: leadA.id, userId: "user_test", type: "note", content: "for A" });
      await service.createActivity({ customerId: customer.id, leadId: leadB.id, userId: "user_test", type: "note", content: "for B" });

      const result = await service.getActivitiesForLead(leadA.id, { page: 1, pageSize: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe("for A");
    });

    it("paginates database-side", async () => {
      const customer = await makeCustomer(customerRepository);
      for (let i = 0; i < 5; i += 1) {
        await service.createActivity({ customerId: customer.id, userId: "user_test", type: "note", content: `note ${i}` });
      }
      const page1 = await service.getActivitiesForCustomer(customer.id, { page: 1, pageSize: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);
    });
  });
});
