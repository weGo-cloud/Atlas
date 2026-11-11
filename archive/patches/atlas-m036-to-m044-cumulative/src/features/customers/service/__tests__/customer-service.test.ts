import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CustomerService as CustomerServiceClass } from "../customer-service";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../repository/database-customer-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-customer-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let CustomerService: typeof CustomerServiceClass;
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

  const serviceModule = await import("../customer-service");
  const repoModule = await import("../../repository/database-customer-repository");
  CustomerService = serviceModule.CustomerService;
  DatabaseCustomerRepository = repoModule.DatabaseCustomerRepository;

  rawDb = new Database(testDbPath);
  // Mission 012: businessId columns FK-reference businesses.id, and
  // foreign_keys enforcement is ON — every row this suite creates
  // with businessId: "biz_test" needs that business to actually exist.
  rawDb.prepare(
    "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run("biz_test", "Test Business", new Date().toISOString(), new Date().toISOString());
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

describe("CustomerService", () => {
  let service: InstanceType<typeof CustomerServiceClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM leads; DELETE FROM customers;");
    service = new CustomerService(new DatabaseCustomerRepository("biz_test"));
  });

  describe("createCustomer", () => {
    it("creates a valid customer", async () => {
      const result = await service.createCustomer({ name: "Jane Wanjiru", phone: "0700000000" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.name).toBe("Jane Wanjiru");
    });

    it("rejects a missing name", async () => {
      const result = await service.createCustomer({ name: "", phone: "0700000000" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.fieldErrors?.name).toBeTruthy();
      }
    });

    it("rejects a customer with neither phone nor email", async () => {
      const result = await service.createCustomer({ name: "Jane" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("accepts a customer with only an email", async () => {
      const result = await service.createCustomer({ name: "Jane", email: "jane@example.com" });
      expect(result.ok).toBe(true);
    });

    it("accepts a customer with only a phone", async () => {
      const result = await service.createCustomer({ name: "Jane", phone: "0700000000" });
      expect(result.ok).toBe(true);
    });

    it("rejects a malformed email", async () => {
      const result = await service.createCustomer({ name: "Jane", email: "not-an-email" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fieldErrors?.email).toBeTruthy();
    });

    it("rejects a malformed phone", async () => {
      const result = await service.createCustomer({ name: "Jane", phone: "abc" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fieldErrors?.phone).toBeTruthy();
    });
  });

  describe("getCustomer", () => {
    it("retrieves an existing customer", async () => {
      const created = await service.createCustomer({ name: "Jane", phone: "0700000000" });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.getCustomer(created.data.id);
      expect(result.ok).toBe(true);
    });

    it("returns NOT_FOUND for a missing customer", async () => {
      const result = await service.getCustomer("does-not-exist");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  describe("updateCustomer", () => {
    it("updates an existing customer", async () => {
      const created = await service.createCustomer({ name: "Jane", phone: "0700000000" });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.updateCustomer(created.data.id, { notes: "Prefers WhatsApp" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.notes).toBe("Prefers WhatsApp");
    });

    it("returns NOT_FOUND for a missing customer", async () => {
      const result = await service.updateCustomer("does-not-exist", { notes: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    it("rejects an update that would leave no contact method", async () => {
      const created = await service.createCustomer({ name: "Jane", phone: "0700000000" });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.updateCustomer(created.data.id, { phone: null });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("allows an update that removes phone but keeps email", async () => {
      const created = await service.createCustomer({
        name: "Jane",
        phone: "0700000000",
        email: "jane@example.com",
      });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.updateCustomer(created.data.id, { phone: null });
      expect(result.ok).toBe(true);
    });
  });

  describe("listCustomers — search", () => {
    it("searches by name at the database level", async () => {
      await service.createCustomer({ name: "Jane Wanjiru", phone: "0700000001" });
      await service.createCustomer({ name: "John Otieno", phone: "0700000002" });

      const result = await service.listCustomers({ search: "otieno" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("John Otieno");
    });

    it("searches by phone and by email too", async () => {
      await service.createCustomer({ name: "Amina Hassan", phone: "0722334455" });
      await service.createCustomer({ name: "Peter Kamau", email: "peter.kamau@example.com" });

      const byPhone = await service.listCustomers({ search: "722334455" });
      expect(byPhone.items.map((c) => c.name)).toEqual(["Amina Hassan"]);

      const byEmail = await service.listCustomers({ search: "peter.kamau" });
      expect(byEmail.items.map((c) => c.name)).toEqual(["Peter Kamau"]);
    });
  });

  describe("listCustomers — pagination (Mission 016)", () => {
    it("paginates database-side and reports accurate totals", async () => {
      for (let i = 0; i < 5; i += 1) {
        await service.createCustomer({ name: `Customer ${i}`, phone: `070000000${i}` });
      }

      const firstPage = await service.listCustomers({ page: 1, pageSize: 2 });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.total).toBe(5);
      expect(firstPage.totalPages).toBe(3);

      const secondPage = await service.listCustomers({ page: 2, pageSize: 2 });
      expect(secondPage.items).toHaveLength(2);
      expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
    });

    it("combines search and pagination correctly", async () => {
      for (let i = 0; i < 3; i += 1) {
        await service.createCustomer({ name: `Search Target ${i}`, phone: `071000000${i}` });
      }
      await service.createCustomer({ name: "Unrelated", phone: "0729999999" });

      const result = await service.listCustomers({ search: "Search Target", page: 1, pageSize: 2 });
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
    });
  });
});
