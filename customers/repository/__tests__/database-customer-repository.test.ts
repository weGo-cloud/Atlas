import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseCustomerRepository as CustomerRepoClass } from "../database-customer-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-customer-db-"));
const testDbPath = path.join(testDir, "test.db");

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

  const repoModule = await import("../database-customer-repository");
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

describe("DatabaseCustomerRepository", () => {
  let repository: InstanceType<typeof CustomerRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM leads; DELETE FROM customers;");
    repository = new DatabaseCustomerRepository("biz_test");
  });

  it("creates a customer and reads it back", async () => {
    const created = await repository.createCustomer({
      name: "Jane Wanjiru",
      phone: "0700000000",
      email: "jane@example.com",
    });
    expect(created.id).toBeTruthy();

    const found = await repository.getCustomerById(created.id);
    expect(found?.name).toBe("Jane Wanjiru");
    expect(found?.phone).toBe("0700000000");
  });

  it("returns null for a missing customer", async () => {
    const found = await repository.getCustomerById("does-not-exist");
    expect(found).toBeNull();
  });

  it("allows customers with the same phone number (no uniqueness constraint)", async () => {
    await repository.createCustomer({ name: "Jane", phone: "0700000000" });
    const second = await repository.createCustomer({ name: "John", phone: "0700000000" });
    expect(second.id).toBeTruthy();
  });

  it("updates a customer", async () => {
    const created = await repository.createCustomer({ name: "Jane", phone: "0700000000" });
    const updated = await repository.updateCustomer(created.id, { notes: "VIP customer" });
    expect(updated?.notes).toBe("VIP customer");
  });

  it("returns null when updating a missing customer", async () => {
    const result = await repository.updateCustomer("does-not-exist", { notes: "x" });
    expect(result).toBeNull();
  });

  it("searches by name", async () => {
    await repository.createCustomer({ name: "Jane Wanjiru", phone: "0700000001" });
    await repository.createCustomer({ name: "John Otieno", phone: "0700000002" });

    const result = await repository.getCustomers({ search: "wanjiru" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Jane Wanjiru");
  });

  it("searches by phone", async () => {
    await repository.createCustomer({ name: "Jane", phone: "0712345678" });
    await repository.createCustomer({ name: "John", phone: "0798765432" });

    const result = await repository.getCustomers({ search: "12345" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Jane");
  });

  it("searches by email", async () => {
    await repository.createCustomer({ name: "Jane", email: "jane@atlas.test" });
    await repository.createCustomer({ name: "John", email: "john@other.test" });

    const result = await repository.getCustomers({ search: "atlas.test" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Jane");
  });

  it("paginates results", async () => {
    for (let i = 0; i < 5; i++) {
      await repository.createCustomer({ name: `Customer ${i}`, phone: `070000000${i}` });
    }
    const result = await repository.getCustomers({ page: 1, pageSize: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(3);
  });

  it("counts customers", async () => {
    await repository.createCustomer({ name: "Jane", phone: "0700000000" });
    await repository.createCustomer({ name: "John", phone: "0700000001" });
    expect(await repository.countCustomers()).toBe(2);
  });
});
