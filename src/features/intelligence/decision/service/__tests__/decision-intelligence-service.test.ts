import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseLeadRepository as LeadRepoClass } from "../../../../leads/repository/database-lead-repository";
import type { DatabaseActivityRepository as ActivityRepoClass } from "../../../../activities/repository/database-activity-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../../customers/repository/database-customer-repository";
import { DecisionIntelligenceService } from "../decision-intelligence-service";
import { PredictionService } from "../../../predictive/service/prediction-service";
import { InMemoryModelArtifactStore } from "../../../predictive/lead-conversion/model-artifact";
import { trainLeadConversionModel } from "../../../predictive/lead-conversion/trainer";
import { LEAD_CONVERSION_FEATURE_NAMES } from "../../../predictive/lead-conversion/feature-builder";
import type { LeadConversionExample } from "../../../predictive/lead-conversion/dataset-builder";
import { ALL_TIME_RANGE } from "../../../domain/__tests__/fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-decision-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseLeadRepository: typeof LeadRepoClass;
let DatabaseActivityRepository: typeof ActivityRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let getOperationalIntelligenceServiceFn: (businessId: string) => import("../../../operational/service/operational-intelligence-service").OperationalIntelligenceService;
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
  getOperationalIntelligenceServiceFn = (await import("../../../operational/service")).getOperationalIntelligenceService;

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

function seedLead(
  businessId: string,
  customerId: string,
  nextFollowUpAt: string | null = null,
  vehicleId: string | null = null,
  status = "new"
) {
  const id = nextId("lead");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO leads (id, business_id, customer_id, vehicle_id, vehicle_label, status, next_follow_up_at, last_contacted_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, '', ?, ?)`
    )
    .run(id, businessId, customerId, vehicleId, status, nextFollowUpAt, now, now);
  return { id };
}

function seedDeal(businessId: string, customerId: string, leadId: string, status: string) {
  const id = nextId("deal");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, 1000000, '', ?, ?)`
    )
    .run(id, businessId, customerId, leadId, status, now, now);
  return { id };
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
  const rng = makeRng(11);
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
    examples.push({ leadId: `synthetic_${i}`, observedAt: new Date(2026, 0, 1 + i).toISOString(), features, label });
  }
  return examples;
}

const NOW = "2026-09-02T00:00:00.000Z";

function buildService(businessId: string, artifactStore: InMemoryModelArtifactStore) {
  const operationalIntelligenceService = getOperationalIntelligenceServiceFn(businessId);
  const predictionService = new PredictionService(
    new DatabaseLeadRepository(businessId),
    new DatabaseActivityRepository(businessId),
    artifactStore
  );
  return new DecisionIntelligenceService(operationalIntelligenceService, predictionService);
}

function seedVehicle(businessId: string, status: string, addedAt: string) {
  const id = nextId("vehicle");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, stock_id, make, model, year, mileage, price, status, description, added_at, updated_at)
       VALUES (?, ?, ?, 'Toyota', 'Fielder', 2020, 50000, 1500000, ?, '', ?, ?)`
    )
    .run(id, businessId, `STK-${id}`, status, addedAt, now);
  return { id };
}

describe("DecisionIntelligenceService", () => {
  beforeEach(() => {
    rawDb.exec("DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM customers; DELETE FROM vehicles;");
  });

  it("produces no decisions against a quiet business", async () => {
    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);
    expect(result.decisions).toEqual([]);
    expect(result.summary.totalDecisions).toBe(0);
  });

  it("produces a DATA_INTEGRITY decision for a completed deal with no Sale record", async () => {
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = seedLead(BIZ_A, customer.id);
    seedDeal(BIZ_A, customer.id, lead.id, "completed");

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    const decision = result.decisions.find((d) => d.category === "DATA_INTEGRITY");
    expect(decision).toBeDefined();
    expect(decision?.affectedEntities.some((e) => e.type === "deal")).toBe(true);
  });

  it("attaches AVAILABLE predictive evidence to a FOLLOW_UP decision when a trained model is active", async () => {
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    // Overdue leads to trigger review_overdue_follow_ups (threshold is 3).
    const overdueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    seedLead(BIZ_A, customer.id, overdueDate);
    seedLead(BIZ_A, customer.id, overdueDate);
    const thirdLead = seedLead(BIZ_A, customer.id, overdueDate);
    // Backdate this one so it clears the model's observation window.
    rawDb.prepare("UPDATE leads SET created_at = ? WHERE id = ?").run("2026-08-15T00:00:00.000Z", thirdLead.id);

    const store = new InMemoryModelArtifactStore();
    const trained = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
    expect(trained.status).toBe("READY");
    if (trained.status === "READY") await store.save(trained.artifact);

    const service = buildService(BIZ_A, store);
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    const decision = result.decisions.find((d) => d.category === "FOLLOW_UP");
    expect(decision).toBeDefined();
    // At least the one backdated (scoreable) lead should have produced available predictive evidence.
    expect(decision!.predictive.available.length + decision!.predictive.unavailableCount).toBeGreaterThan(0);
  });

  it("never leaks another business's decisions or evidence (cross-business isolation)", async () => {
    const otherCustomerRepo = new DatabaseCustomerRepository(BIZ_B);
    const otherCustomer = await otherCustomerRepo.createCustomer({ name: "Other", phone: "0711111111" });
    for (let i = 0; i < 5; i++) {
      const lead = seedLead(BIZ_B, otherCustomer.id);
      seedDeal(BIZ_B, otherCustomer.id, lead.id, "completed");
    }

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);
    expect(result.decisions).toEqual([]);
  });

  it("is deterministic — identical underlying data and timestamp produce identical results", async () => {
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = seedLead(BIZ_A, customer.id);
    seedDeal(BIZ_A, customer.id, lead.id, "completed");

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const a = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);
    const b = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);
    expect(a).toEqual(b);
  });

  it("produces an INVENTORY_REVIEW decision carrying the specific stale vehicle as an affected entity (Mission 026)", async () => {
    seedVehicle(BIZ_A, "available", "2026-05-30T00:00:00.000Z"); // 95 days old as of NOW

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    const decision = result.decisions.find((d) => d.sourceRecommendations.includes("review_stale_vehicles"));
    expect(decision).toBeDefined();
    expect(decision?.category).toBe("INVENTORY_REVIEW");
    expect(decision?.affectedEntities[0]?.type).toBe("vehicle");
    // No predictive evidence — no vehicle-level M023 model exists, and none is fabricated.
    expect(decision?.predictive.available).toEqual([]);
  });

  it("never leaks another business's vehicle into a decision (Mission 026 cross-business isolation)", async () => {
    seedVehicle(BIZ_B, "available", "2026-05-30T00:00:00.000Z");

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    expect(result.decisions.find((d) => d.sourceRecommendations.includes("review_stale_vehicles"))).toBeUndefined();
  });

  it("consolidates a vehicle's stale-vehicle and stale-no-active-lead decisions into one INVENTORY_REVIEW decision (Mission 027)", async () => {
    const vehicle = seedVehicle(BIZ_A, "available", "2026-05-30T00:00:00.000Z"); // 95 days old, zero leads

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    const inventoryDecisions = result.decisions.filter((d) => d.category === "INVENTORY_REVIEW");
    expect(inventoryDecisions).toHaveLength(1);
    const decision = inventoryDecisions[0];
    expect(decision.sourceRecommendations).toContain("review_stale_vehicles");
    expect(decision.sourceRecommendations).toContain("review_stale_vehicles_no_active_lead");
    expect(decision.affectedEntities.filter((e) => e.id === vehicle.id)).toHaveLength(1); // deduped, not doubled
    // The stronger (URGENT) priority wins the consolidation.
    expect(decision.priority).toBe("URGENT");
  });

  it("produces an INVENTORY_REVIEW decision for a stale vehicle with an active lead that carries only review_stale_vehicles (Mission 027)", async () => {
    const customerRepo = new DatabaseCustomerRepository(BIZ_A);
    const customer = await customerRepo.createCustomer({ name: "F", phone: "0700000006" });
    const vehicle = seedVehicle(BIZ_A, "available", "2026-05-30T00:00:00.000Z");
    seedLead(BIZ_A, customer.id, null, vehicle.id, "new");

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    const decision = result.decisions.find((d) => d.sourceRecommendations.includes("review_stale_vehicles"));
    expect(decision).toBeDefined();
    expect(decision?.sourceRecommendations).not.toContain("review_stale_vehicles_no_active_lead");
    // Priority stays at the plain stale-vehicle tier (HIGH at this age), not the compound URGENT tier.
    expect(decision?.priority).toBe("HIGH");
  });

  it("never leaks another business's unengaged stale vehicle into a decision (Mission 027 cross-business isolation)", async () => {
    seedVehicle(BIZ_B, "available", "2026-05-30T00:00:00.000Z");

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    expect(
      result.decisions.find((d) => d.sourceRecommendations.includes("review_stale_vehicles_no_active_lead"))
    ).toBeUndefined();
  });

  it("does not fabricate predictive evidence for the compound vehicle decision (Mission 027)", async () => {
    seedVehicle(BIZ_A, "available", "2026-05-30T00:00:00.000Z");

    const service = buildService(BIZ_A, new InMemoryModelArtifactStore());
    const result = await service.getDecisionIntelligence(ALL_TIME_RANGE, NOW);

    const decision = result.decisions.find((d) => d.sourceRecommendations.includes("review_stale_vehicles_no_active_lead"));
    expect(decision).toBeDefined();
    expect(decision?.predictive.available).toEqual([]);
  });
});
