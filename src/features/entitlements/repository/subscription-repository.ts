import type { SubscriptionPlan } from "../domain/plan";
import type { Subscription, SubscriptionStatus } from "../domain/subscription";

export type UpdateSubscriptionInput = Partial<{
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerStatus: string | null;
}>;

export interface SubscriptionRepository {
  /**
   * Every business has at most one subscription (the `subscriptions`
   * table's `businessId` is unique — see schema.ts). Returns null if
   * one hasn't been created yet (shouldn't happen for a business
   * created through `BusinessRepository.create`, which always creates
   * one alongside it — see database-business-repository.ts — but
   * callers still handle null rather than assuming).
   */
  getByBusinessId(businessId: string): Promise<Subscription | null>;
  create(input: { businessId: string; plan: SubscriptionPlan; status: SubscriptionStatus }): Promise<Subscription>;
  update(businessId: string, input: UpdateSubscriptionInput): Promise<Subscription | null>;
}
