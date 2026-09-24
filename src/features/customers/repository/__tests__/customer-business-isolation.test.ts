import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseCustomerRepository as CustomerRepoClass } from "../database-customer-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-customer-isolation-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseCustomerRepository: typeof CustomerRepoClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_cust_isolation_a";
const BUSINESS_B = "biz_cust_isolation_b";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  setupDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(BUSINESS_A, "Business A", now, now);
  setupDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(BUSINESS_B, "Business B", now, now);
  setupDb.close();

  const repoModule = await import("../database-customer-repository");
  DatabaseCustomerRepository = repoModule.DatabaseCustomerRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

describe("Cross-business customer isolation (Mission 012, Phase 7 — critical)", () => {
  let repoA: InstanceType<typeof CustomerRepoClass>;
  let repoB: InstanceType<typeof CustomerRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM leads; DELETE FROM customers;");
    repoA = new DatabaseCustomerRepository(BUSINESS_A);
    repoB = new DatabaseCustomerRepository(BUSINESS_B);
  });

  it("business B cannot read business A's customer by id", async () => {
    const customerA = await repoA.createCustomer({ name: "Jane A", phone: "0700000001" });
    const found = await repoB.getCustomerById(customerA.id);
    expect(found).toBeNull();
  });

  it("business B's customer list never includes business A's customers", async () => {
    await repoA.createCustomer({ name: "Jane A", phone: "0700000002" });
    await repoB.createCustomer({ name: "John B", phone: "0700000003" });

    const resultB = await repoB.getCustomers({});
    expect(resultB.items).toHaveLength(1);
    expect(resultB.items[0].name).toBe("John B");
  });

  it("business B's search cannot surface business A's customers even with a matching name", async () => {
    await repoA.createCustomer({ name: "Shared Name", phone: "0700000004" });
    // Business B has no customer named this — search must return
    // empty, not accidentally find business A's row.
    const result = await repoB.getCustomers({ search: "Shared Name" });
    expect(result.items).toHaveLength(0);
  });

  it("business B cannot update business A's customer by manipulating the id", async () => {
    const customerA = await repoA.createCustomer({ name: "Jane A", phone: "0700000005" });
    const updated = await repoB.updateCustomer(customerA.id, { notes: "hijacked" });
    expect(updated).toBeNull();

    const stillA = await repoA.getCustomerById(customerA.id);
    expect(stillA?.notes).toBe("");
  });

  it("business B cannot resolve business A's customer via getCustomersByIds", async () => {
    const customerA = await repoA.createCustomer({ name: "Jane A", phone: "0700000006" });
    const customerB = await repoB.createCustomer({ name: "John B", phone: "0700000007" });

    const result = await repoB.getCustomersByIds([customerA.id, customerB.id]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(customerB.id);
  });

  it("countCustomers is scoped per business", async () => {
    await repoA.createCustomer({ name: "A1", phone: "0700000008" });
    await repoA.createCustomer({ name: "A2", phone: "0700000009" });
    await repoB.createCustomer({ name: "B1", phone: "0700000010" });

    expect(await repoA.countCustomers()).toBe(2);
    expect(await repoB.countCustomers()).toBe(1);
  });

  it("a freshly created customer is always stamped with the constructing repository's businessId", async () => {
    const customerA = await repoA.createCustomer({ name: "Jane A", phone: "0700000011" });
    expect(customerA.businessId).toBe(BUSINESS_A);
  });
});
