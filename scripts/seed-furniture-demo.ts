import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { businesses, furnitureProducts, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/features/auth/lib/password";

/**
 * Mission 030 — the Furniture-vertical counterpart to
 * scripts/backfill-business-ownership.ts's dev Auto business. A
 * separate script rather than folding this into that one or into
 * seed.ts: those two are Auto-specific by design (they reference
 * `vehicles` directly), and Section 2's scope rule is explicit about
 * not refactoring existing, working infrastructure to accommodate a
 * new vertical when an additive sibling does the job. Running this
 * script never touches `biz_dev`, its owner, or any vehicle row.
 *
 * Fixed, well-known IDs (idempotent — safe to re-run) for the same
 * reason as the Auto backfill script.
 */
const FURNITURE_BUSINESS_ID = "biz_dev_furniture";
const FURNITURE_OWNER_ID = "user_dev_furniture_owner";
const FURNITURE_OWNER_EMAIL = "owner@wegofurniture.dev";
const FURNITURE_OWNER_PASSWORD = "atlas-dev-2026";

const DEMO_PRODUCTS: Array<{
  id: string;
  name: string;
  description: string;
  category: (typeof furnitureProducts.$inferInsert)["category"];
  price: number;
  condition: (typeof furnitureProducts.$inferInsert)["condition"];
  status: (typeof furnitureProducts.$inferInsert)["status"];
  material: string | null;
  color: string | null;
  dimensions: string | null;
  sku: string | null;
}> = [
  {
    id: "furn_demo_sofa_1",
    name: "Nairobi 3-Seater Sofa",
    description: "A generously cushioned 3-seater sofa in a durable woven fabric, built for daily family use.",
    category: "sofas",
    price: 68000,
    condition: "new",
    status: "available",
    material: "Woven fabric, hardwood frame",
    color: "Charcoal grey",
    dimensions: "210cm x 90cm x 85cm",
    sku: "SOF-NBI-001",
  },
  {
    id: "furn_demo_bed_1",
    name: "Karen Queen Bed Frame",
    description: "Solid mahogany queen bed frame with a padded headboard.",
    category: "beds",
    price: 45000,
    condition: "new",
    status: "available",
    material: "Solid mahogany",
    color: "Walnut brown",
    dimensions: "160cm x 200cm",
    sku: "BED-KRN-002",
  },
  {
    id: "furn_demo_dining_1",
    name: "Westlands 6-Seater Dining Set",
    description: "A 6-seater dining table with matching upholstered chairs, seats six comfortably.",
    category: "dining_tables",
    price: 95000,
    condition: "new",
    status: "reserved",
    material: "Oak veneer, fabric-upholstered chairs",
    color: "Natural oak",
    dimensions: "180cm x 90cm x 75cm",
    sku: "DIN-WST-003",
  },
  {
    id: "furn_demo_office_1",
    name: "Upperhill Office Desk",
    description: "Compact office desk with two drawers, ideal for a home office.",
    category: "office_furniture",
    price: 22000,
    condition: "used",
    status: "available",
    material: "Engineered wood",
    color: "White",
    dimensions: "120cm x 60cm x 75cm",
    sku: "OFC-UPH-004",
  },
  {
    id: "furn_demo_tvstand_1",
    name: "Lavington TV Stand",
    description: "Media console with open shelving and cable management, fits up to a 65-inch TV.",
    category: "tv_stands",
    price: 18500,
    condition: "new",
    status: "sold",
    material: "MDF, tempered glass",
    color: "Black",
    dimensions: "150cm x 40cm x 45cm",
    sku: "TVS-LVG-005",
  },
];

async function main() {
  const now = new Date().toISOString();

  const existingBusiness = await db.select().from(businesses).where(eq(businesses.id, FURNITURE_BUSINESS_ID)).limit(1);

  if (existingBusiness.length === 0) {
    await db.insert(businesses).values({
      id: FURNITURE_BUSINESS_ID,
      name: "Wego Furniture Demo",
      vertical: "furniture",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created Furniture demo business: ${FURNITURE_BUSINESS_ID}`);
  } else {
    console.log(`Furniture demo business already exists: ${FURNITURE_BUSINESS_ID}`);
  }

  const existingUser = await db.select().from(users).where(eq(users.id, FURNITURE_OWNER_ID)).limit(1);

  if (existingUser.length === 0) {
    const passwordHash = await hashPassword(FURNITURE_OWNER_PASSWORD);
    await db.insert(users).values({
      id: FURNITURE_OWNER_ID,
      businessId: FURNITURE_BUSINESS_ID,
      name: "Furniture Demo Owner",
      email: FURNITURE_OWNER_EMAIL,
      passwordHash,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created Furniture demo owner: ${FURNITURE_OWNER_EMAIL}`);
    console.log(`  Sign in with: ${FURNITURE_OWNER_EMAIL} / ${FURNITURE_OWNER_PASSWORD}`);
  } else {
    console.log(`Furniture demo owner already exists: ${FURNITURE_OWNER_EMAIL}`);
  }

  for (const product of DEMO_PRODUCTS) {
    await db
      .insert(furnitureProducts)
      .values({
        id: product.id,
        businessId: FURNITURE_BUSINESS_ID,
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        currency: "KES",
        condition: product.condition,
        status: product.status,
        material: product.material,
        color: product.color,
        dimensions: product.dimensions,
        sku: product.sku,
        addedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: furnitureProducts.id,
        set: {
          name: product.name,
          description: product.description,
          category: product.category,
          price: product.price,
          condition: product.condition,
          status: product.status,
          material: product.material,
          color: product.color,
          dimensions: product.dimensions,
          sku: product.sku,
          updatedAt: now,
        },
      });
  }
  console.log(`Seeded ${DEMO_PRODUCTS.length} furniture products.`);
  console.log("\nFurniture demo seed complete.");
}

main().catch((error) => {
  console.error("Furniture demo seed failed:", error);
  process.exitCode = 1;
});
