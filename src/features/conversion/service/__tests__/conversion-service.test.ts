import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ConversionService as ConversionServiceClass } from "../conversion-service";
import type { DatabaseBusinessRepository as BusinessRepoClass } from "../../../auth/repository/database-business-repository";
import type { EntitlementService as EntitlementServiceClass } from "../../../entitlements/service/entitlement-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-conversion-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let ConversionService: typeof ConversionServiceClass;
let DatabaseBusinessRepository: typeof BusinessRepoClass;
let EntitlementService: typeof EntitlementServiceClass;
let DatabaseSubscriptionRepository: typeof import("../../../entitlements/repository/database-subscription-repository").DatabaseSubscriptionRepository;
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

  ConversionService = (await import("../conversion-service")).ConversionService;
  DatabaseBusinessRepository = (await import("../../../auth/repository/database-business-repository"))
    .DatabaseBusinessRepository;
  EntitlementService = (await import("../../../entitlements/service/entitlement-service")).EntitlementService;
  DatabaseSubscriptionRepository = (await import("../../../entitlements/repository/database-subscription-repository"))
    .DatabaseSubscriptionRepository;

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

function seedBusiness(
  overrides: Partial<{ plan: string; websiteMode: string; vertical: string }> = {}
): string {
  const id = nextId("biz");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO businesses (id, name, vertical, website_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, `Business ${id}`, overrides.vertical ?? "auto", overrides.websiteMode ?? "none", now, now);
  rawDb
    .prepare(
      `INSERT INTO subscriptions (id, business_id, plan, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`
    )
    .run(`sub_${id}`, id, overrides.plan ?? "starter", now, now);
  return id;
}

function seedVehicle(businessId: string, status = "available"): string {
  const id = nextId("veh");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, make, model, year, stock_id, mileage, price, status, description, added_at, updated_at)
       VALUES (?, ?, 'Toyota', 'Vitz', 2021, ?, 12000, 1800000, ?, '', ?, ?)`
    )
    .run(id, businessId, id, status, now, now);
  return id;
}

/** Mission 030 — the Furniture-vertical counterpart to seedVehicle, used by the getPublicCatalog/submitPublicLead test blocks below. */
function seedFurnitureProduct(businessId: string, status = "available"): string {
  const id = nextId("furn");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO furniture_products (id, business_id, name, description, category, price, currency, condition, status, added_at, updated_at)
       VALUES (?, ?, 'Nairobi 3-Seater Sofa', '', 'sofas', 50000, 'KES', 'new', ?, ?, ?)`
    )
    .run(id, businessId, status, now, now);
  return id;
}

function getService(): ConversionServiceClass {
  return new ConversionService(new DatabaseBusinessRepository(), new EntitlementService(new DatabaseSubscriptionRepository()));
}

describe("ConversionService.resolveChannel", () => {
  it("fails with BUSINESS_NOT_FOUND for an unknown business id", async () => {
    const result = await getService().resolveChannel("does-not-exist", "storefront");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BUSINESS_NOT_FOUND");
  });

  it("fails with FORBIDDEN when the plan does not include storefront (starter)", async () => {
    const businessId = seedBusiness({ plan: "starter" });
    const result = await getService().resolveChannel(businessId, "storefront");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("fails with STOREFRONT_DISABLED when entitled but the business hasn't turned it on", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "none" });
    const result = await getService().resolveChannel(businessId, "storefront");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STOREFRONT_DISABLED");
  });

  it("succeeds when entitled and enabled (growth)", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const result = await getService().resolveChannel(businessId, "storefront");
    expect(result.ok).toBe(true);
  });

  it("fails with FORBIDDEN for external_integration on a plan that lacks it (growth)", async () => {
    const businessId = seedBusiness({ plan: "growth" });
    const result = await getService().resolveChannel(businessId, "external_integration");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("succeeds for external_integration on pro without needing atlas_hosted website mode", async () => {
    const businessId = seedBusiness({ plan: "pro", websiteMode: "none" });
    const result = await getService().resolveChannel(businessId, "external_integration");
    expect(result.ok).toBe(true);
  });
});

describe("ConversionService.getPublicCatalog", () => {
  it("lists only available vehicles, mapped to generic CatalogItem shape", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    seedVehicle(businessId, "available");
    seedVehicle(businessId, "reserved");

    const channel = await getService().resolveChannel(businessId, "storefront");
    if (!channel.ok) throw new Error("expected ok");
    const { items, itemNounPlural } = await getService().getPublicCatalog(channel.data);

    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("2021 Toyota Vitz");
    expect(itemNounPlural).toBe("vehicles");
  });

  it("never leaks another business's inventory into the catalog", async () => {
    const businessA = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const businessB = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    seedVehicle(businessB, "available");

    const channel = await getService().resolveChannel(businessA, "storefront");
    if (!channel.ok) throw new Error("expected ok");
    const { items } = await getService().getPublicCatalog(channel.data);

    expect(items).toHaveLength(0);
  });
});

describe("ConversionService.submitPublicLead", () => {
  it("rejects a submission missing name/phone with field-level validation errors", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const channel = await getService().resolveChannel(businessId, "storefront");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "storefront", { name: "", phone: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.name).toBeDefined();
      expect(result.error.fieldErrors?.phone).toBeDefined();
    }
  });

  it("creates a customer and a lead, tagging the lead's source with the channel", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const channel = await getService().resolveChannel(businessId, "storefront");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "storefront", {
      name: "Jane Doe",
      phone: "0700111222",
    });
    expect(result.ok).toBe(true);

    const leadRow = rawDb.prepare("SELECT source, vehicle_id FROM leads WHERE id = ?").get(
      result.ok ? result.data.leadId : ""
    ) as { source: string; vehicle_id: string | null };
    expect(leadRow.source).toBe("storefront");
    expect(leadRow.vehicle_id).toBeNull();
  });

  it("resolves a valid catalogItemId to the lead's vehicleId", async () => {
    const businessId = seedBusiness({ plan: "pro", websiteMode: "atlas_hosted" });
    const vehicleId = seedVehicle(businessId, "available");
    const channel = await getService().resolveChannel(businessId, "external_integration");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "external_integration", {
      name: "John Buyer",
      phone: "0700333444",
      catalogItemId: vehicleId,
    });
    expect(result.ok).toBe(true);

    const leadRow = rawDb.prepare("SELECT source, vehicle_id FROM leads WHERE id = ?").get(
      result.ok ? result.data.leadId : ""
    ) as { source: string; vehicle_id: string | null };
    expect(leadRow.source).toBe("external_integration");
    expect(leadRow.vehicle_id).toBe(vehicleId);
  });

  it("silently drops a stale/invalid catalogItemId rather than failing the submission", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const channel = await getService().resolveChannel(businessId, "storefront");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "storefront", {
      name: "Ada",
      phone: "0700555666",
      catalogItemId: "does-not-exist",
    });
    expect(result.ok).toBe(true);
    const leadRow = rawDb.prepare("SELECT vehicle_id FROM leads WHERE id = ?").get(
      result.ok ? result.data.leadId : ""
    ) as { vehicle_id: string | null };
    expect(leadRow.vehicle_id).toBeNull();
  });

  it("never resolves a catalogItemId belonging to a different business", async () => {
    const businessA = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const businessB = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted" });
    const businessBVehicle = seedVehicle(businessB, "available");

    const channel = await getService().resolveChannel(businessA, "storefront");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "storefront", {
      name: "Cross Tenant",
      phone: "0700777888",
      catalogItemId: businessBVehicle,
    });
    expect(result.ok).toBe(true);
    const leadRow = rawDb.prepare("SELECT vehicle_id FROM leads WHERE id = ?").get(
      result.ok ? result.data.leadId : ""
    ) as { vehicle_id: string | null };
    expect(leadRow.vehicle_id).toBeNull();
  });
});

/**
 * Mission 030 — the same three describe blocks above, run against a
 * `vertical: "furniture"` business instead of "auto". This is the
 * direct proof that onboarding the vertical required no changes to
 * ConversionService itself: resolveChannel's entitlement/website-mode
 * logic, getPublicCatalog's shape, and submitPublicLead's
 * catalogItemId resolution all behave identically, just routed
 * through FurnitureCatalogAdapter instead of AutoCatalogAdapter.
 */
describe("ConversionService — Furniture vertical", () => {
  it("getPublicCatalog lists only available furniture products, with the furniture noun", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted", vertical: "furniture" });
    seedFurnitureProduct(businessId, "available");
    seedFurnitureProduct(businessId, "sold");

    const channel = await getService().resolveChannel(businessId, "storefront");
    if (!channel.ok) throw new Error("expected ok");
    const { items, itemNounPlural, itemNounSingular } = await getService().getPublicCatalog(channel.data);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Nairobi 3-Seater Sofa");
    expect(itemNounPlural).toBe("items");
    expect(itemNounSingular).toBe("item");
  });

  it("never leaks another business's furniture into the catalog", async () => {
    const businessA = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted", vertical: "furniture" });
    const businessB = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted", vertical: "furniture" });
    seedFurnitureProduct(businessB, "available");

    const channel = await getService().resolveChannel(businessA, "storefront");
    if (!channel.ok) throw new Error("expected ok");
    const { items } = await getService().getPublicCatalog(channel.data);

    expect(items).toHaveLength(0);
  });

  it("submitPublicLead resolves a valid catalogItemId to the lead's furnitureProductId, not vehicleId", async () => {
    const businessId = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted", vertical: "furniture" });
    const productId = seedFurnitureProduct(businessId, "available");
    const channel = await getService().resolveChannel(businessId, "storefront");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "storefront", {
      name: "Furniture Buyer",
      phone: "0700999000",
      catalogItemId: productId,
    });
    expect(result.ok).toBe(true);

    const leadRow = rawDb
      .prepare("SELECT vehicle_id, furniture_product_id FROM leads WHERE id = ?")
      .get(result.ok ? result.data.leadId : "") as { vehicle_id: string | null; furniture_product_id: string | null };
    expect(leadRow.furniture_product_id).toBe(productId);
    expect(leadRow.vehicle_id).toBeNull();
  });

  it("never resolves a furniture catalogItemId belonging to a different business", async () => {
    const businessA = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted", vertical: "furniture" });
    const businessB = seedBusiness({ plan: "growth", websiteMode: "atlas_hosted", vertical: "furniture" });
    const businessBProduct = seedFurnitureProduct(businessB, "available");

    const channel = await getService().resolveChannel(businessA, "storefront");
    if (!channel.ok) throw new Error("expected ok");

    const result = await getService().submitPublicLead(channel.data, "storefront", {
      name: "Cross Tenant",
      phone: "0700111000",
      catalogItemId: businessBProduct,
    });
    expect(result.ok).toBe(true);
    const leadRow = rawDb
      .prepare("SELECT furniture_product_id FROM leads WHERE id = ?")
      .get(result.ok ? result.data.leadId : "") as { furniture_product_id: string | null };
    expect(leadRow.furniture_product_id).toBeNull();
  });
});
