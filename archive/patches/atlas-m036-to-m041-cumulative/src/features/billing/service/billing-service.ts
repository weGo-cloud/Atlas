import { timingSafeEqual } from "node:crypto";

import { isPaidPlan, listPlans, planDefinition, type SubscriptionPlan } from "@/features/entitlements/domain/plan";
import { resolveEffectiveSubscription } from "@/features/entitlements/domain/subscription";
import { DatabaseSubscriptionRepository } from "@/features/entitlements/repository/database-subscription-repository";
import { failPayment, okPayment, type PaymentResult } from "@/features/payments/domain/errors";
import { describeStkFailure, parseStkCallback } from "@/features/payments/mpesa/callback";
import { DarajaClient, DarajaError, type DarajaConfig, type MpesaClient } from "@/features/payments/mpesa/daraja-client";
import { normalizeKenyanPhone } from "@/features/payments/mpesa/phone";
import { DatabasePaymentRepository } from "@/features/payments/repository/database-payment-repository";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { GRACE_DAYS, RENEWAL_LEAD_DAYS, addMonthsUtc, isPastGrace, isPromptDue, PROMPT_COOLDOWN_MS, type BillingInvoice } from "../domain/billing";
import { DatabaseBillingRepository } from "../repository/database-billing-repository";

type Env = Record<string, string | undefined>;

/** Atlas's OWN collection account (where plan payments land). Null when not fully configured: billing is then off, never half-on. */
export function platformDarajaConfig(env: Env = process.env): DarajaConfig | null {
  const environment = env.MPESA_PLATFORM_ENV;
  const type = env.MPESA_PLATFORM_TYPE === "till" ? "till" : "paybill";
  const { MPESA_PLATFORM_CONSUMER_KEY: key, MPESA_PLATFORM_CONSUMER_SECRET: secret, MPESA_PLATFORM_PASSKEY: passkey, MPESA_PLATFORM_SHORTCODE: shortcode } = env;
  if ((environment !== "sandbox" && environment !== "production") || !key || !secret || !passkey || !shortcode || !/^\d{5,7}$/.test(shortcode)) return null;
  return { environment, transactionType: type, shortcode, tillNumber: env.MPESA_PLATFORM_TILL || null, consumerKey: key, consumerSecret: secret, passkey };
}

export const billingCallbackToken = (env: Env = process.env) => (env.BILLING_CALLBACK_TOKEN && /^[a-f0-9]{48}$/.test(env.BILLING_CALLBACK_TOKEN) ? env.BILLING_CALLBACK_TOKEN : null);

/** Kill switch + completeness: BILLING_ENABLED=false turns the whole billing engine off without touching code. */
export function billingEnabled(env: Env = process.env): boolean {
  if ((env.BILLING_ENABLED ?? "true").toLowerCase() === "false") return false;
  return platformDarajaConfig(env) !== null && billingCallbackToken(env) !== null && Boolean(env.PUBLIC_BASE_URL && /^https:\/\//.test(env.PUBLIC_BASE_URL));
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type CycleSummary = { skipped: boolean; invoicesCreated: number; promptsSent: number; settled: number; pastDue: number; downgraded: number; voided: number; errors: number };

export type BillingView = {
  enabled: boolean;
  plans: Array<{ id: SubscriptionPlan; name: string; amount: number }>;
  openInvoice: BillingInvoice | null;
  savedPhone: string | null;
  currentPlan: SubscriptionPlan;
  periodEnd: string | null;
  autoRenew: boolean;
};

export type BillingDeps = { repo?: DatabaseBillingRepository; mpesaFactory?: (config: DarajaConfig) => MpesaClient; now?: () => Date; env?: Env };

/**
 * Mission 041 — Atlas's own subscription billing, collected by M-Pesa, with an automated renewal cycle.
 *
 * Trust model: the AMOUNT and PLAN of every charge come from the code-defined catalog on the server, never from a request;
 * an invoice becomes paid only after Safaricom itself confirms it (callback token + independent STK query + amount match),
 * settled atomically with the subscription change and idempotent under replays. All timing is evaluated against an
 * explicit `now`, so the cycle is deterministic and safe to run repeatedly (hourly) from any scheduler.
 */
export class BillingService {
  private readonly repo: DatabaseBillingRepository;
  private readonly now: () => Date;
  private readonly env: Env;

  constructor(private readonly deps: BillingDeps = {}) {
    this.repo = deps.repo ?? new DatabaseBillingRepository();
    this.now = deps.now ?? (() => new Date());
    this.env = deps.env ?? process.env;
  }

  isEnabled(): boolean {
    return billingEnabled(this.env);
  }

  private client(): MpesaClient | null {
    const config = platformDarajaConfig(this.env);
    return config ? (this.deps.mpesaFactory ?? ((c) => new DarajaClient(c)))(config) : null;
  }

  private event(businessId: string, action: string, detail: Record<string, unknown> = {}, actorUserId: string | null = null) {
    return new DatabasePaymentRepository(businessId).recordEvent({ action: `billing_${action}`, actorUserId, detail });
  }

  // ───────────────────────────── owner-initiated ─────────────────────────────

  async startUpgrade(businessId: string, planInput: unknown, phoneInput: unknown, actorUserId: string): Promise<PaymentResult<{ message: string }>> {
    if (!this.isEnabled()) return failPayment({ code: "NOT_CONNECTED", message: "Online plan payments aren't available yet. Please contact the Atlas team to upgrade." });
    const plan = listPlans().find((p) => p.id === planInput)?.id;
    if (!plan || !isPaidPlan(plan) || planDefinition(plan).status !== "active") return failPayment({ code: "VALIDATION_ERROR", message: "Choose a paid plan." });
    const phone = typeof phoneInput === "string" ? normalizeKenyanPhone(phoneInput) : null;
    if (!phone) return failPayment({ code: "VALIDATION_ERROR", message: "Enter a valid Safaricom number.", fieldErrors: { phone: "Enter a valid Safaricom number, e.g. 0712 345 678." } });

    const nowMs = this.now().getTime();
    if (!checkRateLimit(`billing-start:${businessId}`, 5, 3_600_000, nowMs).allowed || !checkRateLimit(`billing-phone:${phone}`, 3, 3_600_000, nowMs).allowed) {
      return failPayment({ code: "RATE_LIMITED", message: "Too many payment attempts. Please wait before trying again." });
    }

    const subscription = await new DatabaseSubscriptionRepository().getByBusinessId(businessId);
    if (!subscription) return failPayment({ code: "NOT_FOUND", message: "No subscription found for this business." });
    const effective = resolveEffectiveSubscription(subscription, this.now());
    const paidUpTo = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : 0;
    if (effective.fallback === null && effective.subscription.plan === plan && effective.subscription.status === "active" && paidUpTo > nowMs + RENEWAL_LEAD_DAYS * 86_400_000) {
      return failPayment({ code: "INVALID_STATE", message: "You're already on this plan and paid up." });
    }

    const nowIso = this.now().toISOString();
    const invoice = await this.repo.createInvoice({ businessId, plan, amount: planPrice(plan), kind: "upgrade", periodStart: nowIso, periodEnd: addMonthsUtc(nowIso, 1), dueAt: nowIso }, true);
    if (!invoice) return failPayment({ code: "INVALID_STATE", message: "A payment is already in progress. Please try again in a moment." });
    await this.repo.saveBillingPhone(businessId, phone);
    await this.event(businessId, "invoice_created", { kind: "upgrade", plan, amount: invoice.amount }, actorUserId);

    const sent = await this.sendPrompt(invoice, phone, actorUserId);
    return sent.ok ? okPayment({ message: `An M-Pesa prompt for KSh ${invoice.amount.toLocaleString("en-KE")} was sent to your phone. Enter your PIN to activate ${planDefinition(plan).name}.` }) : sent;
  }

  /** "Pay now" on an open invoice (e.g. a renewal prompt was missed). */
  async payOpenInvoice(businessId: string, phoneInput: unknown, actorUserId: string): Promise<PaymentResult<{ message: string }>> {
    if (!this.isEnabled()) return failPayment({ code: "NOT_CONNECTED", message: "Online plan payments aren't available yet." });
    const invoice = await this.repo.getOpenInvoice(businessId);
    if (!invoice) return failPayment({ code: "NOT_FOUND", message: "There's no unpaid invoice." });
    const phone = typeof phoneInput === "string" && phoneInput.trim() ? normalizeKenyanPhone(phoneInput) : (invoice.payerPhone ?? (await this.repo.getSubscriptionPhone(businessId)));
    if (!phone) return failPayment({ code: "VALIDATION_ERROR", message: "Enter a valid Safaricom number.", fieldErrors: { phone: "Enter a valid Safaricom number." } });
    const nowMs = this.now().getTime();
    if (!checkRateLimit(`billing-pay:${businessId}`, 6, 3_600_000, nowMs).allowed || !checkRateLimit(`billing-phone:${phone}`, 3, 3_600_000, nowMs).allowed) {
      return failPayment({ code: "RATE_LIMITED", message: "Too many payment attempts. Please wait before trying again." });
    }
    if (invoice.attempts >= 12) return failPayment({ code: "RATE_LIMITED", message: "Too many prompts were sent for this invoice. Please contact the Atlas team." });
    if (invoice.paymentState === "pending" && invoice.lastAttemptAt && nowMs - new Date(invoice.lastAttemptAt).getTime() < PROMPT_COOLDOWN_MS) {
      return failPayment({ code: "RATE_LIMITED", message: "A prompt was just sent. Approve it on your phone, or tap “Check status”." });
    }
    if (invoice.paymentState === "pending" && invoice.checkoutRequestId) {
      const settled = await this.tryRefresh(invoice);
      if (settled === "paid") return okPayment({ message: "Payment received. Your plan is active." });
    }
    const current = (await this.repo.getOpenInvoice(businessId)) ?? invoice;
    const sent = await this.sendPrompt(current, phone, actorUserId);
    return sent.ok ? okPayment({ message: `An M-Pesa prompt for KSh ${invoice.amount.toLocaleString("en-KE")} was sent to your phone.` }) : sent;
  }

  async refreshOpenInvoice(businessId: string): Promise<PaymentResult<{ message: string }>> {
    const invoice = await this.repo.getOpenInvoice(businessId);
    if (!invoice) return okPayment({ message: "Nothing is waiting for payment." });
    if (!invoice.checkoutRequestId) return okPayment({ message: "No prompt has been sent yet." });
    if (!checkRateLimit(`billing-refresh:${businessId}`, 6, 10 * 60_000, this.now().getTime()).allowed) return failPayment({ code: "RATE_LIMITED", message: "Checked too often. Please wait a minute." });
    const outcome = await this.tryRefresh(invoice);
    return okPayment({ message: outcome === "paid" ? "Payment received. Your plan is active." : outcome === "failed" ? "The payment didn't go through. You can try again." : "Still waiting for you to approve the prompt on your phone." });
  }

  // ───────────────────────────── M-Pesa plumbing ─────────────────────────────

  /** Only the compare-and-set winner for this prompt number may call M-Pesa, so concurrent runs can never double-prompt. */
  private async sendPrompt(invoice: BillingInvoice, phone: string, actorUserId: string | null): Promise<PaymentResult<null>> {
    const client = this.client();
    const base = this.env.PUBLIC_BASE_URL;
    const token = billingCallbackToken(this.env);
    if (!client || !base || !token) return failPayment({ code: "NOT_CONNECTED", message: "Online plan payments aren't available yet." });
    if (!(await this.repo.claimAttempt(invoice.id, invoice.attempts, this.now().toISOString()))) return failPayment({ code: "RATE_LIMITED", message: "A prompt is already being sent." });
    try {
      const response = await client.stkPush({
        phone,
        amount: invoice.amount,
        accountReference: `ATLAS${invoice.id.slice(-6).toUpperCase()}`,
        description: "Atlas plan",
        callbackUrl: `${base.replace(/\/$/, "")}/api/billing/mpesa/callback/${token}`,
      });
      await this.repo.attachPrompt(invoice.id, { checkoutRequestId: response.checkoutRequestId, merchantRequestId: response.merchantRequestId, phone });
      await this.event(invoice.businessId, "prompt_sent", { invoiceId: invoice.id, attempt: invoice.attempts + 1 }, actorUserId);
      return okPayment(null);
    } catch (error) {
      const message = error instanceof DarajaError ? error.message : "Could not send the M-Pesa prompt.";
      await this.repo.markPromptFailed(invoice.id, message);
      await this.event(invoice.businessId, "prompt_failed", { invoiceId: invoice.id, kind: error instanceof DarajaError ? error.kind : "unknown" }, actorUserId);
      return failPayment({ code: "PROVIDER_ERROR", message });
    }
  }

  /** Asks Safaricom about an invoice's latest prompt. Success settles it; a clear failure is recorded; still-processing is left alone. */
  private async tryRefresh(invoice: BillingInvoice): Promise<"paid" | "failed" | "pending"> {
    const client = this.client();
    if (!client || !invoice.checkoutRequestId) return "pending";
    try {
      const query = await client.stkQuery(invoice.checkoutRequestId);
      if (query.resultCode === 0) return (await this.settle(invoice, null)) ? "paid" : "pending";
      if (query.resultCode === null) return "pending";
      const failure = describeStkFailure(query.resultCode, query.resultDesc);
      await this.repo.markPromptFailed(invoice.id, failure.reason);
      return "failed";
    } catch {
      return "pending";
    }
  }

  private async settle(invoice: BillingInvoice, receipt: string | null): Promise<boolean> {
    const result = await this.repo.settlePaid(invoice.id, { receipt, paidAtIso: this.now().toISOString() });
    if (result.ok) {
      await this.event(invoice.businessId, "invoice_paid", { invoiceId: invoice.id, plan: invoice.plan, amount: invoice.amount, kind: invoice.kind, hasReceipt: Boolean(receipt) });
      return true;
    }
    if (result.reason === "duplicate_receipt") await this.event(invoice.businessId, "duplicate_receipt", { invoiceId: invoice.id });
    return false;
  }

  /**
   * Safaricom's callback for a plan payment. Authenticity: the secret URL token (constant-time), a strict body parse, then an
   * independent STK query before anything is credited; the amount must equal the invoice. Replays are no-ops.
   */
  async applyCallback(token: string, body: unknown): Promise<PaymentResult<{ outcome: "paid" | "failed" | "ignored" | "pending" }>> {
    const expected = billingCallbackToken(this.env);
    if (!this.isEnabled() || !expected || !safeEqual(expected, token)) return failPayment({ code: "FORBIDDEN", message: "Invalid callback." });
    const callback = parseStkCallback(body);
    if (!callback) return failPayment({ code: "VALIDATION_ERROR", message: "Malformed callback." });
    const invoice = await this.repo.findByCheckoutRequestId(callback.checkoutRequestId);
    if (!invoice) return failPayment({ code: "NOT_FOUND", message: "Unknown transaction." });
    if (invoice.status !== "open") return okPayment({ outcome: "ignored" });

    if (callback.resultCode !== 0) {
      await this.repo.markPromptFailed(invoice.id, describeStkFailure(callback.resultCode, callback.resultDesc).reason);
      return okPayment({ outcome: "failed" });
    }
    if (callback.amount !== invoice.amount) {
      await this.event(invoice.businessId, "callback_amount_mismatch", { invoiceId: invoice.id, expected: invoice.amount, got: callback.amount });
      return okPayment({ outcome: "pending" });
    }
    const client = this.client();
    if (!client) return failPayment({ code: "NOT_CONNECTED", message: "Billing isn't configured." });
    try {
      const query = await client.stkQuery(callback.checkoutRequestId);
      if (query.resultCode !== 0) {
        await this.event(invoice.businessId, "callback_not_verified", { invoiceId: invoice.id, queryResult: query.resultCode });
        return okPayment({ outcome: "pending" });
      }
    } catch {
      return okPayment({ outcome: "pending" }); // the next cycle / "Check status" settles it
    }
    return okPayment({ outcome: (await this.settle(invoice, callback.receipt)) ? "paid" : "ignored" });
  }

  // ───────────────────────────── the automated cycle ─────────────────────────────

  /**
   * Run hourly (idempotent). 1) invoice subscriptions that renew within 3 days; 2) settle unresolved prompts, send due prompts
   * (3 days before, on the day, +2, +5); 3) after the due date mark past_due (access continues), and after the 7-day grace close
   * the invoice and drop to the free plan. Upgrade invoices never trigger past-due/downgrade: an unpaid upgrade is simply voided after 24h.
   */
  async runCycle(): Promise<CycleSummary> {
    const summary: CycleSummary = { skipped: false, invoicesCreated: 0, promptsSent: 0, settled: 0, pastDue: 0, downgraded: 0, voided: 0, errors: 0 };
    if (!this.isEnabled()) return { ...summary, skipped: true };
    const now = this.now();
    const nowIso = now.toISOString();

    for (const candidate of await this.repo.listRenewalCandidates(new Date(now.getTime() + RENEWAL_LEAD_DAYS * 86_400_000).toISOString())) {
      try {
        if (await this.repo.hasPaidInvoiceFrom(candidate.businessId, candidate.periodEnd)) continue;
        const created = await this.repo.createInvoice(
          { businessId: candidate.businessId, plan: candidate.plan, amount: planPrice(candidate.plan), kind: "renewal", periodStart: candidate.periodEnd, periodEnd: addMonthsUtc(candidate.periodEnd, 1), dueAt: candidate.periodEnd },
          false
        );
        if (created) {
          summary.invoicesCreated += 1;
          await this.event(candidate.businessId, "invoice_created", { kind: "renewal", plan: candidate.plan, amount: created.amount });
        }
      } catch {
        summary.errors += 1;
      }
    }

    for (const listed of await this.repo.listOpenInvoices()) {
      try {
        let invoice: BillingInvoice | null = listed;
        if (invoice.paymentState === "pending" && invoice.checkoutRequestId && (!invoice.lastAttemptAt || now.getTime() - new Date(invoice.lastAttemptAt).getTime() >= PROMPT_COOLDOWN_MS)) {
          if ((await this.tryRefresh(invoice)) === "paid") {
            summary.settled += 1;
            continue;
          }
          invoice = await this.repo.getOpenInvoice(invoice.businessId);
          if (!invoice) continue;
        }

        if (invoice.kind === "upgrade") {
          // dueAt == creation time on the billing clock for upgrade invoices, so this is deterministic (no DB-clock dependency).
          if (now.getTime() - new Date(invoice.dueAt).getTime() > 24 * 3_600_000) {
            // An unpaid upgrade attempt just lapses; nothing about the subscription changes.
            summary.voided += (await this.repo.voidInvoice(invoice.id, nowIso)) ? 1 : 0;
          }
          continue;
        }

        if (isPastGrace(invoice, now)) {
          if (await this.repo.closeUncollectible(invoice.id, nowIso)) {
            summary.downgraded += 1;
            await this.event(invoice.businessId, "downgraded_unpaid", { invoiceId: invoice.id, graceDays: GRACE_DAYS });
          }
          continue;
        }
        if (now.getTime() > new Date(invoice.dueAt).getTime() && (await this.repo.markPastDue(invoice.businessId, nowIso))) {
          summary.pastDue += 1;
          await this.event(invoice.businessId, "past_due", { invoiceId: invoice.id });
        }
        if (isPromptDue(invoice, now)) {
          const phone = invoice.payerPhone ?? (await this.repo.getSubscriptionPhone(invoice.businessId));
          if (phone && (await this.sendPrompt(invoice, phone, null)).ok) summary.promptsSent += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }
    return summary;
  }

  // ───────────────────────────────── reads ─────────────────────────────────

  async getView(businessId: string): Promise<BillingView> {
    const subscription = await new DatabaseSubscriptionRepository().getByBusinessId(businessId);
    const effective = subscription ? resolveEffectiveSubscription(subscription, this.now()) : null;
    return {
      enabled: this.isEnabled(),
      plans: listPlans().filter((p) => isPaidPlan(p.id) && p.status === "active").map((p) => ({ id: p.id, name: p.name, amount: planPrice(p.id) })),
      openInvoice: await this.repo.getOpenInvoice(businessId),
      savedPhone: await this.repo.getSubscriptionPhone(businessId),
      currentPlan: effective?.subscription.plan ?? "starter",
      periodEnd: subscription?.currentPeriodEnd ?? null,
      autoRenew: subscription ? !subscription.cancelAtPeriodEnd : false,
    };
  }
}

function planPrice(plan: SubscriptionPlan): number {
  const pricing = planDefinition(plan).pricing;
  if (!pricing.configured || pricing.amount <= 0) throw new Error(`Plan ${plan} has no configured price`);
  return pricing.amount;
}
