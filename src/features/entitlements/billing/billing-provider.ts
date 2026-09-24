import type { SubscriptionPlan } from "../domain/plan";

/**
 * Mission 029, Section 8/29 — the replaceable boundary between
 * Atlas's subscription domain and any future payment processor.
 *
 *   Atlas Subscription → Billing Interface → Provider Adapter → Stripe/M-Pesa/etc.
 *
 * Nothing in this mission implements this interface against a real
 * processor (Section 29: "do NOT turn M029 into a payment-provider
 * integration mission") and nothing in the application calls it yet —
 * SubscriptionLifecycleService's operations are all "commercial
 * intent" (Section 2's distinction), driven by an owner/admin action,
 * not by a confirmed payment. A future mission wires a concrete
 * adapter (e.g. `StripeBillingProvider implements BillingProvider`)
 * behind this same interface and has SubscriptionLifecycleService
 * call it at the points marked in that file's doc comment — the core
 * domain (domain/, service/) must never import a provider SDK
 * directly, only this interface.
 */
export type BillingCustomerRef = {
  provider: string;
  providerCustomerId: string;
};

export type BillingSubscriptionRef = {
  provider: string;
  providerSubscriptionId: string;
  /** The provider's own status string (e.g. Stripe's "trialing"/"past_due"/...) — deliberately untyped/opaque here. Mapping a provider status onto Atlas's SubscriptionStatus is BillingEvent's job (billing-events.ts), not this interface's — a provider's status vocabulary isn't Atlas's. */
  providerStatus: string;
};

export interface BillingProvider {
  createCustomer(input: { businessId: string; email: string; name: string }): Promise<BillingCustomerRef>;
  createSubscription(input: {
    customer: BillingCustomerRef;
    plan: SubscriptionPlan;
    interval: "monthly" | "annual";
  }): Promise<BillingSubscriptionRef>;
  changeSubscription(input: {
    subscription: BillingSubscriptionRef;
    plan: SubscriptionPlan;
  }): Promise<BillingSubscriptionRef>;
  cancelSubscription(input: {
    subscription: BillingSubscriptionRef;
    atPeriodEnd: boolean;
  }): Promise<BillingSubscriptionRef>;
  getSubscriptionStatus(subscription: BillingSubscriptionRef): Promise<BillingSubscriptionRef>;
}

/**
 * Deliberately the only "implementation" that ships in this mission —
 * every method rejects. Exists so (a) the core domain can be typed
 * against `BillingProvider` today without a real adapter existing yet,
 * and (b) tests can assert the domain layer never imports a
 * provider-specific module (Section 24 #22) by constructing a service
 * with this and confirming no lifecycle operation ever calls it.
 */
export class UnconfiguredBillingProvider implements BillingProvider {
  private unconfigured(): never {
    throw new Error(
      "No billing provider is configured. Atlas's subscription domain does not require one — see billing-provider.ts."
    );
  }
  async createCustomer(): Promise<BillingCustomerRef> {
    this.unconfigured();
  }
  async createSubscription(): Promise<BillingSubscriptionRef> {
    this.unconfigured();
  }
  async changeSubscription(): Promise<BillingSubscriptionRef> {
    this.unconfigured();
  }
  async cancelSubscription(): Promise<BillingSubscriptionRef> {
    this.unconfigured();
  }
  async getSubscriptionStatus(): Promise<BillingSubscriptionRef> {
    this.unconfigured();
  }
}
