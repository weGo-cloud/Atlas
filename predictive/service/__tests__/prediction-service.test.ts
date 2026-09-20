import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseLeadRepository as LeadRepoClass } from "../../../../leads/repository/database-lead-repository";
import type { DatabaseActivityRepository as ActivityRepoClass } from "../../../../activities/repository/database-activity-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../../customers/repository/database-customer-repository";
import { PredictionService } from "../prediction-service";
import { InMemoryModelArtifactStore } from "../../lead-conversion/model-artifact";
import { trainLeadConversionModel } from "../../lead-conversion/trainer";
import { LEAD_CONVERSION_FEATURE_NAMES } from "../../lead-conversion/feature-builder";
import type { LeadConversionExample } from "../../lead-conversion/dataset-builder";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-prediction-service-db-"));
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

function backdateLead(leadId: string, createdAt: string) {
  rawDb.prepare("UPDATE leads SET created_at = ? WHERE id = ?").run(createdAt, leadId);
}

function makeRng(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSyntheticDataset(count: number): LeadConversionExample[] {
  const rng = makeRng(3);
  const examples: LeadConversionExample[] = [];
  for (let i = 0; i < count; i++) {
    const activityCount = Math.floor(rng() * 10);
    const hadDealCreated = rng() < 0.2 + activityCount * 0.03 ? 1 : 0;
    const noise = rng();
    const label: 0 | 1 = 0.15 + activityCount * 0.05 + hadDealCreated * 0.2 > noise ? 1 : 0;
    const features = LEAD_CONVERSION_FEATURE_NAMES.map((name) => {
      if (name === "activityCount") return activityCount;
      if (name === "hadDealCreated") return hadDealCreated;
      return 0;
    });
    examples.push({ leadId: `lead_${i}`, observedAt: new Date(2026, 0, 1 + i).toISOString(), features, label });
  }
  return examples;
}

const NOW = "2026-09-02T00:00:00.000Z";

describe("PredictionService", () => {
  beforeEach(() => {
    rawDb.exec("DELETE FROM activities; DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM customers;");
  });

  it("returns MODEL_NOT_READY when no artifact is active", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = await leadRepo.createLead({ customerId: customer.id });
    backdateLead(lead.id, "2026-08-15T00:00:00.000Z"); // 18 days old — old enough to clear the observation window, before the horizon

    const service = new PredictionService(leadRepo, activityRepo, new InMemoryModelArtifactStore());
    const prediction = await service.predictLeadConversion(lead.id, NOW);
    expect(prediction.status).toBe("MODEL_NOT_READY");
  });

  it("returns INSUFFICIENT_DATA for a lead younger than the observation window", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = await leadRepo.createLead({ customerId: customer.id });
    backdateLead(lead.id, "2026-08-31T00:00:00.000Z"); // 2 days old, window is 7

    const store = new InMemoryModelArtifactStore();
    const trained = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
    if (trained.status === "READY") await store.save(trained.artifact);

    const service = new PredictionService(leadRepo, activityRepo, store);
    const prediction = await service.predictLeadConversion(lead.id, NOW);
    expect(prediction.status).toBe("INSUFFICIENT_DATA");
  });

  it("returns UNSUPPORTED for a lead past its own prediction horizon", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = await leadRepo.createLead({ customerId: customer.id });
    backdateLead(lead.id, "2026-07-01T00:00:00.000Z"); // 63 days old, horizon is 30

    const store = new InMemoryModelArtifactStore();
    const trained = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
    if (trained.status === "READY") await store.save(trained.artifact);

    const service = new PredictionService(leadRepo, activityRepo, store);
    const prediction = await service.predictLeadConversion(lead.id, NOW);
    expect(prediction.status).toBe("UNSUPPORTED");
  });

  it("returns AVAILABLE with a valid probability for a lead within the scoreable window, when a model is active", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = await leadRepo.createLead({ customerId: customer.id });
    backdateLead(lead.id, "2026-08-15T00:00:00.000Z"); // 18 days old — between the 7-day window and 30-day horizon

    const store = new InMemoryModelArtifactStore();
    const trained = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
    expect(trained.status).toBe("READY");
    if (trained.status === "READY") await store.save(trained.artifact);

    const service = new PredictionService(leadRepo, activityRepo, store);
    const prediction = await service.predictLeadConversion(lead.id, NOW);
    expect(prediction.status).toBe("AVAILABLE");
    if (prediction.status === "AVAILABLE") {
      expect(prediction.probability).toBeGreaterThanOrEqual(0);
      expect(prediction.probability).toBeLessThanOrEqual(1);
      expect(prediction.evidence.length).toBeGreaterThan(0);
    }
  });

  it("returns ERROR for an unknown lead id", async () => {
    const leadRepo = new DatabaseLeadRepository(BIZ_A);
    const activityRepo = new DatabaseActivityRepository(BIZ_A);
    const service = new PredictionService(leadRepo, activityRepo, new InMemoryModelArtifactStore());
    const prediction = await service.predictLeadConversion("nonexistent_lead", NOW);
    expect(prediction.status).toBe("ERROR");
  });

  it("never scores another business's lead (cross-business isolation)", async () => {
    const leadRepoB = new DatabaseLeadRepository(BIZ_B);
    const customerRepoB = new DatabaseCustomerRepository(BIZ_B);
    const customerB = await customerRepoB.createCustomer({ name: "B", phone: "0711111111" });
    const leadB = await leadRepoB.createLead({ customerId: customerB.id });
    backdateLead(leadB.id, "2026-08-01T00:00:00.000Z");

    // Business A's service instance trying to score Business B's lead id.
    const leadRepoA = new DatabaseLeadRepository(BIZ_A);
    const activityRepoA = new DatabaseActivityRepository(BIZ_A);
    const service = new PredictionService(leadRepoA, activityRepoA, new InMemoryModelArtifactStore());
    const prediction = await service.predictLeadConversion(leadB.id, NOW);
    expect(prediction.status).toBe("ERROR");
  });

  describe("getLeadConversionModelStatus", () => {
    it("reports inactive when no artifact is stored", async () => {
      const leadRepo = new DatabaseLeadRepository(BIZ_A);
      const activityRepo = new DatabaseActivityRepository(BIZ_A);
      const service = new PredictionService(leadRepo, activityRepo, new InMemoryModelArtifactStore());
      expect(await service.getLeadConversionModelStatus()).toEqual({ active: false });
    });

    it("reports the active model's identity once one is trained", async () => {
      const leadRepo = new DatabaseLeadRepository(BIZ_A);
      const activityRepo = new DatabaseActivityRepository(BIZ_A);
      const store = new InMemoryModelArtifactStore();
      const trained = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
      expect(trained.status).toBe("READY");
      if (trained.status === "READY") await store.save(trained.artifact);

      const service = new PredictionService(leadRepo, activityRepo, store);
      const status = await service.getLeadConversionModelStatus();
      expect(status).toEqual({ active: true, modelVersion: "lead-conversion-v1", trainedAt: NOW, trainingDataCutoff: NOW });
    });
  });
});
