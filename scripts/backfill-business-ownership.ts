import "dotenv/config";

import { db } from "../src/lib/db/client";
import { businesses, customers, leads, users, vehicles } from "../src/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { hashPassword } from "../src/features/auth/lib/password";

/**
 * Mission 012 migration strategy, documented here rather than as SQL
 * because the interesting part — hashing a real password — can't
 * happen inside a .sql migration file.
 *
 * Fixed, well-known IDs (not randomly generated) so this script is
 * idempotent: re-running it after the business/user already exist
 * just skips creation and re-runs the (also idempotent, WHERE
 * business_id IS NULL) backfill, which is a no-op once nothing is
 * left ownerless.
 */
const DEV_BUSINESS_ID = "biz_dev";
const DEV_OWNER_ID = "user_dev_owner";
const DEV_OWNER_EMAIL = "owner@atlas.dev";
const DEV_OWNER_PASSWORD = "atlas-dev-2026";

async function main() {
  const now = new Date().toISOString();

  const existingBusiness = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, DEV_BUSINESS_ID))
    .limit(1);

  if (existingBusiness.length === 0) {
    await db.insert(businesses).values({
      id: DEV_BUSINESS_ID,
      name: "Atlas Development Dealership",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created development business: ${DEV_BUSINESS_ID}`);
  } else {
    console.log(`Development business already exists: ${DEV_BUSINESS_ID}`);
  }

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, DEV_OWNER_ID))
    .limit(1);

  if (existingUser.length === 0) {
    const passwordHash = await hashPassword(DEV_OWNER_PASSWORD);
    await db.insert(users).values({
      id: DEV_OWNER_ID,
      businessId: DEV_BUSINESS_ID,
      name: "Dev Owner",
      email: DEV_OWNER_EMAIL,
      passwordHash,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created development owner user: ${DEV_OWNER_EMAIL}`);
    console.log(`  Sign in with: ${DEV_OWNER_EMAIL} / ${DEV_OWNER_PASSWORD}`);
  } else {
    console.log(`Development owner user already exists: ${DEV_OWNER_EMAIL}`);
  }

  // Backfill: every vehicle/customer/lead that predates ownership
  // (business_id IS NULL) belongs to the development business. This
  // is a WHERE-scoped UPDATE, so it's safe to run repeatedly — rows
  // that already have an owner are left untouched.
  const vehicleResult = await db
    .update(vehicles)
    .set({ businessId: DEV_BUSINESS_ID })
    .where(isNull(vehicles.businessId));
  console.log(`Backfilled ${vehicleResult.changes} vehicle(s).`);

  const customerResult = await db
    .update(customers)
    .set({ businessId: DEV_BUSINESS_ID })
    .where(isNull(customers.businessId));
  console.log(`Backfilled ${customerResult.changes} customer(s).`);

  const leadResult = await db
    .update(leads)
    .set({ businessId: DEV_BUSINESS_ID })
    .where(isNull(leads.businessId));
  console.log(`Backfilled ${leadResult.changes} lead(s).`);

  console.log("\nBackfill complete.");
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
