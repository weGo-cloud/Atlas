import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { businesses, type BusinessRow } from "@/lib/db/schema";
import { DatabaseSubscriptionRepository } from "../../entitlements/repository/database-subscription-repository";
import type { SubscriptionRepository } from "../../entitlements/repository/subscription-repository";
import type { Business } from "../domain/business";
import type { BusinessRepository, UpdateBusinessSettingsInput } from "./business-repository";

export class DatabaseBusinessRepository implements BusinessRepository {
  /**
   * Mission 028 — every business gets exactly one subscription row
   * the moment it's created (see create() below), so nothing
   * downstream (EntitlementService, settings UI) ever has to handle
   * "business exists but has no subscription yet" as a real case.
   * Defaulted rather than required so every pre-existing call site
   * that constructs `new DatabaseBusinessRepository()` with no
   * arguments keeps working unchanged.
   */
  constructor(private readonly subscriptionRepository: SubscriptionRepository = new DatabaseSubscriptionRepository()) {}

  async getById(id: string): Promise<Business | null> {
    const rows = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, id))
      .limit(1);
    return rows[0] ? toBusiness(rows[0]) : null;
  }

  async getByPublicApiKey(apiKey: string): Promise<Business | null> {
    if (!apiKey) return null;
    const rows = await db
      .select()
      .from(businesses)
      .where(eq(businesses.publicApiKey, apiKey))
      .limit(1);
    return rows[0] ? toBusiness(rows[0]) : null;
  }

  async create(input: { name: string }): Promise<Business> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(businesses).values({
      id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    });

    // Mission 028, Section 16 — every new business starts on the
    // lowest tier, "active" (a real trial-length/date policy is a
    // billing-provider decision — Section 21 — not modeled here).
    await this.subscriptionRepository.create({ businessId: id, plan: "starter", status: "active" });

    const created = await this.getById(id);
    if (!created) throw new Error("Failed to read back newly created business.");
    return created;
  }

  async updateSettings(id: string, input: UpdateBusinessSettingsInput): Promise<Business | null> {
    const patch: Partial<typeof businesses.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.websiteMode !== undefined) patch.websiteMode = input.websiteMode;
    if (input.publicApiKey !== undefined) patch.publicApiKey = input.publicApiKey;

    await db.update(businesses).set(patch).where(eq(businesses.id, id));
    return this.getById(id);
  }
}

function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    vertical: row.vertical,
    websiteMode: row.websiteMode as Business["websiteMode"],
    publicApiKey: row.publicApiKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `biz_${Date.now().toString(36)}${counter.toString(36)}`;
}
