import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MarketingContentService as ServiceClass } from "../marketing-content-service";
import type { DatabaseMarketingContentRepository as RepoClass } from "../../repository/database-marketing-content-repository";
import type { ContentGenerator, GeneratedBlurb } from "../../ai/content-generator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-marketing-content-db-"));
const testDbPath = path.join(testDir, "test.db");

let MarketingContentService: typeof ServiceClass;
let DatabaseMarketingContentRepository: typeof RepoClass;
let rawDb: Database.Database;

const BUSINESS_ID = "biz_marketing_content_test";

class FakeGenerator implements ContentGenerator {
  constructor(private readonly response: GeneratedBlurb) {}
  async generateBlurb(): Promise<GeneratedBlurb> {
    return this.response;
  }
}

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
    .prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'auto', ?, ?)")
    .run(BUSINESS_ID, "Test Business", now, now);
  setupDb.close();

  // Importing service/index.ts registers the vehicle/furniture item adapters as a side effect.
  await import("../../service/index");
  MarketingContentService = (await import("../marketing-content-service")).MarketingContentService;
  DatabaseMarketingContentRepository = (await import("../../repository/database-marketing-content-repository"))
    .DatabaseMarketingContentRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

let vehicleCounter = 0;
function seedVehicle(overrides: Partial<{ price: number; mileage: number; description: string }> = {}): string {
  vehicleCounter += 1;
  const id = `veh_mkt_${vehicleCounter}`;
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, make, model, year, stock_id, mileage, price, status, description, added_at, updated_at)
       VALUES (?, ?, 'Toyota', 'Vitz', 2021, ?, ?, ?, 'available', ?, ?, ?)`
    )
    .run(id, BUSINESS_ID, id, overrides.mileage ?? 45000, overrides.price ?? 1800000, overrides.description ?? "Well maintained.", now, now);
  return id;
}

beforeEach(() => {
  rawDb.exec("DELETE FROM marketing_content; DELETE FROM vehicles;");
});

function getService(generator: ContentGenerator) {
  return new MarketingContentService(new DatabaseMarketingContentRepository(BUSINESS_ID), BUSINESS_ID, generator);
}

describe("generateContent — grounding (Mission 031, Section 6/24)", () => {
  it("passes the vehicle's real facts to the generator and stores the assembled result", async () => {
    const vehicleId = seedVehicle({ price: 1800000, mileage: 45000 });
    const service = getService(new FakeGenerator({ method: "ai", blurb: "A dependable choice for daily commuting." }));

    const result = await service.generateContent({ itemType: "vehicle", itemId: vehicleId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.generationMethod).toBe("ai");
    expect(result.data.socialCaption).toContain("KSh 1,800,000");
    expect(result.data.socialCaption).toContain("A dependable choice for daily commuting.");
    expect(result.data.whatsappMessage).toContain("KSh 1,800,000");
    expect(result.data.groundedFacts.attributes.Mileage).toBe("45,000 km");
  });

  it("falls back to the template method when the generator states an ungrounded number", async () => {
    const vehicleId = seedVehicle({ price: 1800000, mileage: 45000 });
    const service = getService(
      new FakeGenerator({ method: "ai", blurb: "Comes with a full 7 year warranty and 15% off today!" })
    );

    const result = await service.generateContent({ itemType: "vehicle", itemId: vehicleId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.generationMethod).toBe("template");
    expect(result.data.socialCaption).not.toContain("7 year warranty");
    expect(result.data.socialCaption).not.toContain("15%");
  });

  it("fails with ITEM_NOT_FOUND for a nonexistent vehicle", async () => {
    const service = getService(new FakeGenerator({ method: "ai", blurb: "x" }));
    const result = await service.generateContent({ itemType: "vehicle", itemId: "does-not-exist" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ITEM_NOT_FOUND");
  });

  it("upserts — regenerating replaces the previous draft rather than creating a second row", async () => {
    const vehicleId = seedVehicle();
    const service = getService(new FakeGenerator({ method: "template", blurb: "First blurb." }));
    const first = await service.generateContent({ itemType: "vehicle", itemId: vehicleId });
    expect(first.ok).toBe(true);

    const service2 = getService(new FakeGenerator({ method: "template", blurb: "Second blurb." }));
    const second = await service2.generateContent({ itemType: "vehicle", itemId: vehicleId });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.data.id).toBe(first.data.id);
    expect(second.data.socialCaption).toContain("Second blurb.");

    const rows = rawDb.prepare("SELECT * FROM marketing_content WHERE item_id = ?").all(vehicleId);
    expect(rows).toHaveLength(1);
  });
});

/** Mission 031, Section 13 — staleness after inventory changes. */
describe("staleness after item update", () => {
  it("records sourceUpdatedAt matching the vehicle's updatedAt at generation time", async () => {
    const vehicleId = seedVehicle();
    const service = getService(new FakeGenerator({ method: "template", blurb: "x" }));
    const result = await service.generateContent({ itemType: "vehicle", itemId: vehicleId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const vehicleRow = rawDb.prepare("SELECT updated_at FROM vehicles WHERE id = ?").get(vehicleId) as {
      updated_at: string;
    };
    expect(result.data.sourceUpdatedAt).toBe(vehicleRow.updated_at);
  });
});

/** Mission 031, Section 14 — dealer control over the generated text. */
describe("updateContent — dealer edits", () => {
  it("saves an edited caption", async () => {
    const vehicleId = seedVehicle();
    const service = getService(new FakeGenerator({ method: "template", blurb: "x" }));
    const generated = await service.generateContent({ itemType: "vehicle", itemId: vehicleId });
    if (!generated.ok) throw new Error("setup failed");

    const updated = await service.updateContent(generated.data.id, { socialCaption: "A dealer-edited caption." });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.socialCaption).toBe("A dealer-edited caption.");
  });

  it("rejects an empty caption", async () => {
    const vehicleId = seedVehicle();
    const service = getService(new FakeGenerator({ method: "template", blurb: "x" }));
    const generated = await service.generateContent({ itemType: "vehicle", itemId: vehicleId });
    if (!generated.ok) throw new Error("setup failed");

    const updated = await service.updateContent(generated.data.id, { socialCaption: "   " });
    expect(updated.ok).toBe(false);
  });
});
