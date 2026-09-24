import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { subscriptions, type SubscriptionRow } from "@/lib/db/schema";
import type { SubscriptionPlan } from "../domain/plan";
import type { Subscription, SubscriptionStatus } from "../domain/subscription";
import type { SubscriptionRepository, UpdateSubscriptionInput } from "./subscription-repository";

export class DatabaseSubscriptionRepository implements SubscriptionRepository {
  async getByBusinessId(businessId: string): Promise<Subscription | null> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, businessId))
      .limit(1);
    return rows[0] ? toSubscription(rows[0]) : null;
  }

  async create(input: { businessId: string; plan: SubscriptionPlan; status: SubscriptionStatus }): Promise<Subscription> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(subscriptions).values({
      id,
      businessId: input.businessId,
      plan: input.plan,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.getByBusinessId(input.businessId);
    if (!created) throw new Error("Failed to read back newly created subscription.");
    return created;
  }

  async update(businessId: string, input: UpdateSubscriptionInput): Promise<Subscription | null> {
    const patch: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.plan !== undefined) patch.plan = input.plan;
    if (input.status !== undefined) patch.status = input.status;
    if (input.trialEndsAt !== undefined) patch.trialEndsAt = input.trialEndsAt;
    if (input.currentPeriodStart !== undefined) patch.currentPeriodStart = input.currentPeriodStart;
    if (input.currentPeriodEnd !== undefined) patch.currentPeriodEnd = input.currentPeriodEnd;
    if (input.cancelAtPeriodEnd !== undefined) patch.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.providerCustomerId !== undefined) patch.providerCustomerId = input.providerCustomerId;
    if (input.providerSubscriptionId !== undefined) patch.providerSubscriptionId = input.providerSubscriptionId;
    if (input.providerStatus !== undefined) patch.providerStatus = input.providerStatus;

    await db.update(subscriptions).set(patch).where(eq(subscriptions.businessId, businessId));
    return this.getByBusinessId(businessId);
  }
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    businessId: row.businessId,
    plan: row.plan as Subscription["plan"],
    status: row.status as Subscription["status"],
    trialEndsAt: row.trialEndsAt,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    provider: row.provider,
    providerCustomerId: row.providerCustomerId,
    providerSubscriptionId: row.providerSubscriptionId,
    providerStatus: row.providerStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `sub_${Date.now().toString(36)}${counter.toString(36)}`;
}
