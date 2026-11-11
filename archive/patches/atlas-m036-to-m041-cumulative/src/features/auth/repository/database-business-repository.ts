import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { businesses, type BusinessRow } from "@/lib/db/schema";
import { hashPublicApiKey, publicApiKeyHint } from "@/lib/security/api-key";
import { DatabaseSubscriptionRepository } from "../../entitlements/repository/database-subscription-repository";
import { TRIAL_DAYS, TRIAL_PLAN } from "../../entitlements/domain/plan";
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
    const hashed = await db
      .select()
      .from(businesses)
      .where(eq(businesses.publicApiKeyHash, hashPublicApiKey(apiKey)))
      .limit(1);
    if (hashed[0]) return toBusiness(hashed[0]);

    // Legacy rows (pre-0021) still hold the plaintext key. Accept it once and upgrade in place so
    // existing integrations keep working while the plaintext disappears from the database.
    const legacy = await db.select().from(businesses).where(eq(businesses.publicApiKey, apiKey)).limit(1);
    if (!legacy[0]) return null;
    await db
      .update(businesses)
      .set({ publicApiKeyHash: hashPublicApiKey(apiKey), publicApiKeyHint: publicApiKeyHint(apiKey), publicApiKey: null })
      .where(eq(businesses.id, legacy[0].id));
    return this.getById(legacy[0].id);
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

    // Mission 036 — every new business starts a full-feature trial
    // (TRIAL_DAYS on TRIAL_PLAN). When it ends the business falls back
    // to the free Starter plan automatically (see
    // resolveEffectiveSubscription) — it is never locked out and its
    // data is never touched. `trialEndsAt` is an explicit timestamp
    // computed here at the repository boundary, never inside domain
    // logic.
    const trialEndsAt = new Date(new Date(now).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await this.subscriptionRepository.create({ businessId: id, plan: TRIAL_PLAN, status: "trialing", trialEndsAt });

    const created = await this.getById(id);
    if (!created) throw new Error("Failed to read back newly created business.");
    return created;
  }

  async updateSettings(id: string, input: UpdateBusinessSettingsInput): Promise<Business | null> {
    const patch: Partial<typeof businesses.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.websiteMode !== undefined) patch.websiteMode = input.websiteMode;
    if (input.publicApiAllowedOrigins !== undefined) {
      patch.publicApiAllowedOrigins = input.publicApiAllowedOrigins.length > 0 ? JSON.stringify(input.publicApiAllowedOrigins) : null;
    }

    await db.update(businesses).set(patch).where(eq(businesses.id, id));
    return this.getById(id);
  }

  async setPublicApiKey(id: string, apiKey: string): Promise<Business | null> {
    await db
      .update(businesses)
      .set({
        publicApiKeyHash: hashPublicApiKey(apiKey),
        publicApiKeyHint: publicApiKeyHint(apiKey),
        publicApiKey: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(businesses.id, id));
    return this.getById(id);
  }

  async clearPublicApiKey(id: string): Promise<Business | null> {
    await db
      .update(businesses)
      .set({ publicApiKeyHash: null, publicApiKeyHint: null, publicApiKey: null, updatedAt: new Date().toISOString() })
      .where(eq(businesses.id, id));
    return this.getById(id);
  }
}

function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    vertical: row.vertical,
    websiteMode: row.websiteMode as Business["websiteMode"],
    publicApiKeyHint: row.publicApiKeyHint ?? (row.publicApiKey ? publicApiKeyHint(row.publicApiKey) : null),
    publicApiAllowedOrigins: parseOrigins(row.publicApiAllowedOrigins),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `biz_${Date.now().toString(36)}${counter.toString(36)}`;
}

function parseOrigins(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
