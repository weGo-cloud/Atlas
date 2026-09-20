import "dotenv/config";

import { MOCK_INVENTORY } from "../../features/inventory/data/mock-inventory";
import { db } from "./client";
import { vehicles } from "./schema";

// Must match scripts/backfill-business-ownership.ts's DEV_BUSINESS_ID —
// this seed only makes sense once that business row exists (run the
// backfill script first on a fresh database).
const DEV_BUSINESS_ID = "biz_dev";

/**
 * Loads the Mission 002 mock inventory into the dev database.
 * Upserts on id, so re-running the seed is safe and idempotent —
 * it won't duplicate rows or wipe manual edits made through the app
 * to *other* vehicles.
 */
async function seed() {
  for (const vehicle of MOCK_INVENTORY) {
    await db
      .insert(vehicles)
      .values({
        id: vehicle.id,
        businessId: DEV_BUSINESS_ID,
        stockId: vehicle.stockId,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        mileage: vehicle.mileage,
        price: vehicle.price,
        status: vehicle.status,
        description: vehicle.description,
        addedAt: vehicle.addedAt,
        updatedAt: vehicle.updatedAt,
      })
      .onConflictDoUpdate({
        target: vehicles.id,
        set: {
          stockId: vehicle.stockId,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          mileage: vehicle.mileage,
          price: vehicle.price,
          status: vehicle.status,
          description: vehicle.description,
          addedAt: vehicle.addedAt,
          updatedAt: vehicle.updatedAt,
        },
      });
  }

  console.log(`Seeded ${MOCK_INVENTORY.length} vehicles into the dev database.`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit();
  });
