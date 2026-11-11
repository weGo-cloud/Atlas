import { timingSafeEqual } from "node:crypto";

import { getEntitlementService } from "@/features/entitlements/service";
import type { EntitlementService } from "@/features/entitlements/service/entitlement-service";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { computeBalance, type PaymentSummary } from "../domain/balance";
import { failPayment, okPayment, type PaymentFieldErrors, type PaymentResult } from "../domain/errors";
import type { Payment, PaymentKind, PaymentMethod, PaymentStatus } from "../domain/payment";
import { MPESA_RECEIPT, parseKesAmount, validateManualPayment, type ManualPaymentInput } from "../domain/validate-payment-input";
import { describeStkFailure, parseStkCallback } from "../mpesa/callback";
import { DarajaClient, DarajaError, type DarajaConfig, type DarajaEnvironment, type DarajaTransactionType, type MpesaClient } from "../mpesa/daraja-client";
import { normalizeKenyanPhone } from "../mpesa/phone";
import { parseMpesaSms, type SmsParseResult } from "../mpesa/sms-parser";
import { DatabasePaymentAccountRepository, type PaymentAccountPublic } from "../repository/database-payment-account-repository";
import { DatabasePaymentRepository, isUniqueViolation, type DealContext } from "../repository/database-payment-repository";

export type PaymentServiceDeps = {
  payments?: DatabasePaymentRepository;
  accounts?: DatabasePaymentAccountRepository;
  mpesaFactory?: (config: DarajaConfig) => MpesaClient;
  entitlements?: Pick<EntitlementService, "canAccess">;
  now?: () => Date;
};

export type DealPaymentView = { deal: DealContext; summary: PaymentSummary; payments: Payment[] };

const HOUR = 3_600_000;
const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Kill switch: PAYMENTS_ENABLED=false stops every new STK prompt and callback application without a deploy of code. */
export const paymentsEnabled = () => (process.env.PAYMENTS_ENABLED ?? "true").toLowerCase() !== "false";
export const maxStkAmount = () => envInt("MPESA_MAX_STK_AMOUNT", 250_000);
const hourlyStkVolumeCap = () => envInt("MPESA_STK_HOURLY_VOLUME_CAP_KES", 1_000_000);

const tokenMatches = (expected: string, provided: string) => {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Mission 040 — the payments service. Security model, in one place:
 *  - Tenant isolation: every repository call is scoped to this business; deals/customers are re-checked inside the insert transaction.
 *  - Integrity: amounts are whole shillings; an insert can never overpay a deal (atomic guard); confirmed rows are immutable (DB triggers).
 *  - M-Pesa authenticity: a callback is accepted only with this business's secret URL token AND is then re-confirmed with
 *    Safaricom's own STK query before money is counted; status changes are compare-and-set, so replays/races are no-ops.
 *  - Abuse limits: per-phone, per-user and per-business rate limits plus an hourly STK volume cap bound the damage of a stolen session.
 *  - Evidence: manual M-Pesa/Airtel entries are flagged "manual" (unverified) forever; only Safaricom can make a payment "provider" verified.
 *  - Audit: every sensitive action writes an append-only payment_events row (never containing secrets).
 */
export class PaymentService {
  private readonly payments: DatabasePaymentRepository;
  private readonly accounts: DatabasePaymentAccountRepository;
  private readonly now: () => Date;

  constructor(
    readonly businessId: string,
    private readonly deps: PaymentServiceDeps = {}
  ) {
    this.payments = deps.payments ?? new DatabasePaymentRepository(businessId);
    this.accounts = deps.accounts ?? new DatabasePaymentAccountRepository(businessId);
    this.now = deps.now ?? (() => new Date());
  }

  private client(config: DarajaConfig): MpesaClient {
    return (this.deps.mpesaFactory ?? ((c) => new DarajaClient(c)))(config);
  }

  // ───────────────────────────── manual recording ─────────────────────────────

  async recordPayment(input: ManualPaymentInput, actorUserId: string): Promise<PaymentResult<Payment>> {
    if (!checkRateLimit(`pay-record:${this.businessId}:${actorUserId}`, 60, 10 * 60_000, this.now().getTime()).allowed) {
      return failPayment({ code: "RATE_LIMITED", message: "You're recording payments very quickly. Please wait a few minutes." });
    }
    const validated = validateManualPayment(input, this.now());
    if (!validated.ok) return failPayment({ code: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fieldErrors: validated.fieldErrors });
    const v = validated.value;

    // A cheque isn't money until it clears; everything else a person hands over or transfers is recorded as received.
    const status: PaymentStatus = v.method === "cheque" ? "pending" : "confirmed";
    const result = await this.payments.insertGuarded({ ...v, status, recordedByUserId: actorUserId, verification: "manual" });
    if (!result.ok) {
      return failPayment({
        code: result.code,
        message: result.message,
        fieldErrors: result.code === "DUPLICATE_REFERENCE" ? { reference: result.message } : result.code === "OVERPAYMENT" ? { amount: result.message } : undefined,
      });
    }
    await this.payments.recordEvent({
      paymentId: result.payment.id,
      actorUserId,
      action: "payment_recorded",
      detail: { method: v.method, kind: v.kind, amount: v.amount, status, dealId: v.dealId },
    });
    return okPayment(result.payment);
  }

  /** Cheque cleared / bounced. Only plain pending payments (never an STK prompt, which only Safaricom may settle). */
  async settlePending(paymentId: string, outcome: "confirmed" | "failed", actorUserId: string, reason?: string): Promise<PaymentResult<Payment>> {
    const payment = await this.payments.getById(paymentId);
    if (!payment) return failPayment({ code: "NOT_FOUND", message: "Payment not found." });
    if (payment.status !== "pending") return failPayment({ code: "INVALID_STATE", message: "This payment is no longer pending." });
    if (payment.checkoutRequestId) return failPayment({ code: "INVALID_STATE", message: "M-Pesa prompts are settled by M-Pesa itself. Use “Check status”." });
    if (payment.method !== "cheque") return failPayment({ code: "INVALID_STATE", message: "Only cheques can be settled by hand." });
    const updated = await this.payments.transition(paymentId, ["pending"], {
      status: outcome,
      failureReason: outcome === "failed" ? (reason?.trim().slice(0, 200) || "Cheque bounced or was rejected.") : null,
    });
    if (!updated) return failPayment({ code: "INVALID_STATE", message: "This payment was just updated by someone else." });
    await this.payments.recordEvent({ paymentId, actorUserId, action: outcome === "confirmed" ? "cheque_cleared" : "cheque_failed" });
    return okPayment(updated);
  }

  async reversePayment(paymentId: string, reason: string, actorUserId: string): Promise<PaymentResult<Payment>> {
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) return failPayment({ code: "VALIDATION_ERROR", message: "Give a reason (at least 5 characters).", fieldErrors: { reason: "Give a reason (at least 5 characters)." } });
    const updated = await this.payments.transition(paymentId, ["confirmed"], {
      status: "reversed",
      reversedAt: this.now().toISOString(),
      reversedReason: cleanReason.slice(0, 300),
      reversedByUserId: actorUserId,
    });
    if (!updated) {
      const existing = await this.payments.getById(paymentId);
      return failPayment(existing ? { code: "INVALID_STATE", message: "Only a confirmed payment can be reversed." } : { code: "NOT_FOUND", message: "Payment not found." });
    }
    await this.payments.recordEvent({ paymentId, actorUserId, action: "payment_reversed", detail: { amount: updated.amount, reason: cleanReason.slice(0, 300) } });
    return okPayment(updated);
  }

  async attachReference(paymentId: string, referenceRaw: string, actorUserId: string): Promise<PaymentResult<Payment>> {
    const reference = referenceRaw.trim().toUpperCase().replace(/\s/g, "");
    if (!MPESA_RECEIPT.test(reference)) return failPayment({ code: "VALIDATION_ERROR", message: "Enter the 10-character M-Pesa receipt code.", fieldErrors: { reference: "Enter the 10-character M-Pesa receipt code." } });
    const payment = await this.payments.getById(paymentId);
    if (!payment) return failPayment({ code: "NOT_FOUND", message: "Payment not found." });
    if (payment.method !== "mpesa" || payment.reference || payment.status !== "confirmed") return failPayment({ code: "INVALID_STATE", message: "A receipt can only be added to a confirmed M-Pesa payment that has none." });
    try {
      const updated = await this.payments.attachReference(paymentId, reference);
      if (!updated) return failPayment({ code: "INVALID_STATE", message: "This payment was just updated by someone else." });
      await this.payments.recordEvent({ paymentId, actorUserId, action: "reference_attached", detail: { reference } });
      return okPayment(updated);
    } catch (error) {
      if (isUniqueViolation(error)) return failPayment({ code: "DUPLICATE_REFERENCE", message: "That receipt has already been recorded.", fieldErrors: { reference: "That receipt has already been recorded." } });
      throw error;
    }
  }

  // ─────────────────────────────── M-Pesa STK push ───────────────────────────────

  async requestMpesaStk(
    input: { dealId: string; phone: unknown; amount: unknown; kind: PaymentKind },
    actorUserId: string
  ): Promise<PaymentResult<{ payment: Payment; customerMessage: string }>> {
    if (!paymentsEnabled()) return failPayment({ code: "FORBIDDEN", message: "Payment collection is switched off on this server." });

    const entitled = await (this.deps.entitlements ?? getEntitlementService()).canAccess(this.businessId, "mpesa_collection", this.now());
    if (!entitled.allowed) return failPayment({ code: "NOT_IN_PLAN", message: "M-Pesa prompts need the Growth or Pro plan. You can still record M-Pesa payments by receipt code." });

    const account = await this.accounts.getWithSecrets();
    if (!account) return failPayment({ code: "NOT_CONNECTED", message: "Connect your M-Pesa account in Settings first." });
    const base = process.env.PUBLIC_BASE_URL;
    if (!base || !/^https:\/\//.test(base)) return failPayment({ code: "NOT_CONNECTED", message: "The server's public https address isn't configured, so M-Pesa can't call back yet." });

    const fieldErrors: PaymentFieldErrors = {};
    const phone = typeof input.phone === "string" ? normalizeKenyanPhone(input.phone) : null;
    if (!phone) fieldErrors.phone = "Enter a valid Safaricom number, e.g. 0712 345 678.";
    const amount = parseKesAmount(input.amount);
    if (amount === null) fieldErrors.amount = "Enter a whole-shilling amount greater than 0.";
    else if (amount > maxStkAmount()) fieldErrors.amount = `M-Pesa prompts are limited to KES ${maxStkAmount().toLocaleString("en-KE")} each.`;
    if (!phone || amount === null || Object.keys(fieldErrors).length > 0) return failPayment({ code: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fieldErrors });
    if (input.kind === "refund") return failPayment({ code: "VALIDATION_ERROR", message: "Refunds can't be collected by M-Pesa prompt." });

    const deal = await this.payments.getDealContext(input.dealId);
    if (!deal) return failPayment({ code: "DEAL_NOT_FOUND", message: "Deal not found." });

    const nowMs = this.now().getTime();
    if (!checkRateLimit(`stk-phone:${this.businessId}:${phone}`, 3, HOUR, nowMs).allowed) return failPayment({ code: "RATE_LIMITED", message: "That number has already been sent several prompts this hour. Please wait before sending another." });
    if (!checkRateLimit(`stk-user:${this.businessId}:${actorUserId}`, 20, 10 * 60_000, nowMs).allowed) return failPayment({ code: "RATE_LIMITED", message: "You're sending prompts very quickly. Please wait a few minutes." });
    if (!checkRateLimit(`stk-business:${this.businessId}`, 60, HOUR, nowMs).allowed) return failPayment({ code: "RATE_LIMITED", message: "This business has sent a lot of prompts this hour. Please try again later." });
    const hourAgo = new Date(nowMs - HOUR).toISOString();
    if ((await this.payments.stkVolumeSince(hourAgo)) + amount > hourlyStkVolumeCap()) {
      return failPayment({ code: "RATE_LIMITED", message: "The hourly M-Pesa collection limit for this business was reached. Please try again later." });
    }
    if (await this.payments.findRecentPendingStk(input.dealId, phone, new Date(nowMs - 2 * 60_000).toISOString())) {
      return failPayment({ code: "RATE_LIMITED", message: "A prompt was just sent to this number. Ask the customer to check their phone." });
    }

    // Customer comes from the deal, never from the request, so a prompt can't be attached to someone else's customer.
    const inserted = await this.payments.insertGuarded({
      customerId: deal.customerId,
      dealId: deal.id,
      amount,
      method: "mpesa",
      kind: input.kind,
      status: "pending",
      reference: null,
      payerPhone: phone,
      payerName: null,
      itemLabel: deal.vehicleLabel,
      paidAt: this.now().toISOString(),
      notes: "",
      recordedByUserId: actorUserId,
      verification: "provider",
    });
    if (!inserted.ok) return failPayment({ code: inserted.code, message: inserted.message, fieldErrors: inserted.code === "OVERPAYMENT" ? { amount: inserted.message } : undefined });
    const payment = inserted.payment;

    const callbackUrl = `${base.replace(/\/$/, "")}/api/payments/mpesa/callback/${this.businessId}/${account.callbackToken}`;
    try {
      const response = await this.client(account.config).stkPush({
        phone,
        amount,
        accountReference: `DEAL${deal.id.slice(-6).toUpperCase()}`,
        description: "Payment",
        callbackUrl,
      });
      const updated = await this.payments.transition(payment.id, ["pending"], { checkoutRequestId: response.checkoutRequestId, merchantRequestId: response.merchantRequestId });
      await this.payments.recordEvent({ paymentId: payment.id, actorUserId, action: "stk_requested", detail: { amount, dealId: deal.id } });
      return okPayment({ payment: updated ?? payment, customerMessage: response.customerMessage || "A payment prompt was sent to the customer's phone." });
    } catch (error) {
      const message = error instanceof DarajaError ? error.message : "Could not send the M-Pesa prompt.";
      await this.payments.transition(payment.id, ["pending"], { status: "failed", failureReason: message.slice(0, 200) });
      await this.payments.recordEvent({ paymentId: payment.id, actorUserId, action: "stk_request_failed", detail: { kind: error instanceof DarajaError ? error.kind : "unknown" } });
      return failPayment({ code: "PROVIDER_ERROR", message });
    }
  }

  /**
   * Applies a Daraja STK callback. The caller (webhook route) has already rate-limited by IP. The URL token must match
   * this business's current token (constant-time compare); the callback is then treated as a CLAIM, and a success claim is
   * confirmed with Safaricom's STK query before any money is counted. Idempotent: a replay of an already-settled payment is a no-op.
   */
  async applyStkCallback(token: string, body: unknown): Promise<PaymentResult<{ outcome: "confirmed" | "failed" | "cancelled" | "ignored" | "pending" }>> {
    if (!paymentsEnabled()) return failPayment({ code: "FORBIDDEN", message: "Payments are switched off." });
    const account = await this.accounts.getWithSecrets();
    if (!account || !tokenMatches(account.callbackToken, token)) return failPayment({ code: "FORBIDDEN", message: "Invalid callback." });

    const callback = parseStkCallback(body);
    if (!callback) return failPayment({ code: "VALIDATION_ERROR", message: "Malformed callback." });

    const payment = await this.payments.findByCheckoutRequestId(callback.checkoutRequestId);
    if (!payment) {
      await this.payments.recordEvent({ action: "callback_unknown_checkout", detail: { resultCode: callback.resultCode } });
      return failPayment({ code: "NOT_FOUND", message: "Unknown transaction." });
    }
    if (payment.status !== "pending") return okPayment({ outcome: "ignored" });

    if (callback.resultCode !== 0) {
      const failure = describeStkFailure(callback.resultCode, callback.resultDesc);
      const updated = await this.payments.transition(payment.id, ["pending"], { status: failure.status, failureReason: failure.reason });
      if (updated) await this.payments.recordEvent({ paymentId: payment.id, action: "stk_failed", detail: { resultCode: callback.resultCode } });
      return okPayment({ outcome: updated ? failure.status : "ignored" });
    }

    if (callback.amount !== payment.amount) {
      await this.payments.transition(payment.id, ["pending"], { failureReason: "Needs review: the amount in M-Pesa's callback didn't match the request." });
      await this.payments.recordEvent({ paymentId: payment.id, action: "callback_amount_mismatch", detail: { expected: payment.amount, got: callback.amount } });
      return okPayment({ outcome: "pending" });
    }

    // Independent confirmation with Safaricom: a forged or replayed callback can't pass this.
    try {
      const query = await this.client(account.config).stkQuery(callback.checkoutRequestId);
      if (query.resultCode !== 0) {
        await this.payments.recordEvent({ paymentId: payment.id, action: "callback_not_verified", detail: { queryResult: query.resultCode } });
        return okPayment({ outcome: "pending" });
      }
    } catch {
      await this.payments.recordEvent({ paymentId: payment.id, action: "callback_verify_unavailable" });
      return okPayment({ outcome: "pending" }); // stays pending; "Check status" will settle it
    }

    return this.confirmStk(payment, { reference: callback.receipt, paidAt: callback.transactionAt, payerPhone: callback.phone });
  }

  /** Owner/staff "Check status": asks Safaricom directly. Used when a callback never arrived. */
  async refreshStk(paymentId: string, actorUserId: string): Promise<PaymentResult<{ outcome: "confirmed" | "failed" | "cancelled" | "pending" | "ignored" }>> {
    const payment = await this.payments.getById(paymentId);
    if (!payment) return failPayment({ code: "NOT_FOUND", message: "Payment not found." });
    if (payment.status !== "pending" || !payment.checkoutRequestId) return failPayment({ code: "INVALID_STATE", message: "This payment isn't waiting on an M-Pesa prompt." });
    if (!checkRateLimit(`stk-refresh:${this.businessId}:${paymentId}`, 6, 10 * 60_000, this.now().getTime()).allowed) return failPayment({ code: "RATE_LIMITED", message: "Checked too often. Please wait a minute." });
    const account = await this.accounts.getWithSecrets();
    if (!account) return failPayment({ code: "NOT_CONNECTED", message: "M-Pesa isn't connected." });

    try {
      const query = await this.client(account.config).stkQuery(payment.checkoutRequestId);
      if (query.resultCode === 0) return this.confirmStk(payment, { reference: null, paidAt: null, payerPhone: null }, actorUserId);
      if (query.resultCode === null) {
        const ageMs = this.now().getTime() - new Date(payment.createdAt.replace(" ", "T") + (payment.createdAt.endsWith("Z") ? "" : "Z")).getTime();
        if (ageMs > 30 * 60_000) {
          await this.payments.transition(payment.id, ["pending"], { status: "cancelled", failureReason: "No response from the customer's phone." });
          await this.payments.recordEvent({ paymentId, actorUserId, action: "stk_expired" });
          return okPayment({ outcome: "cancelled" });
        }
        return okPayment({ outcome: "pending" });
      }
      const failure = describeStkFailure(query.resultCode, query.resultDesc);
      const updated = await this.payments.transition(payment.id, ["pending"], { status: failure.status, failureReason: failure.reason });
      if (updated) await this.payments.recordEvent({ paymentId, actorUserId, action: "stk_failed", detail: { resultCode: query.resultCode } });
      return okPayment({ outcome: updated ? failure.status : "ignored" });
    } catch (error) {
      return failPayment({ code: "PROVIDER_ERROR", message: error instanceof DarajaError ? error.message : "Could not check with M-Pesa." });
    }
  }

  private async confirmStk(
    payment: Payment,
    evidence: { reference: string | null; paidAt: string | null; payerPhone: string | null },
    actorUserId: string | null = null
  ): Promise<PaymentResult<{ outcome: "confirmed" | "cancelled" | "ignored" }>> {
    try {
      const updated = await this.payments.transition(payment.id, ["pending"], {
        status: "confirmed",
        reference: evidence.reference,
        failureReason: null,
        ...(evidence.paidAt ? { paidAt: evidence.paidAt } : {}),
        ...(evidence.payerPhone ? { payerPhone: evidence.payerPhone } : {}),
      });
      if (!updated) return okPayment({ outcome: "ignored" });
      await this.payments.recordEvent({ paymentId: payment.id, actorUserId, action: "stk_confirmed", detail: { amount: updated.amount, hasReceipt: Boolean(evidence.reference) } });
      return okPayment({ outcome: "confirmed" });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The same receipt was already recorded by hand: don't count the money twice.
      await this.payments.transition(payment.id, ["pending"], { status: "cancelled", failureReason: "Duplicate: this M-Pesa receipt was already recorded." });
      await this.payments.recordEvent({ paymentId: payment.id, actorUserId, action: "stk_duplicate_receipt" });
      return okPayment({ outcome: "cancelled" });
    }
  }

  // ─────────────────────────────────── reads ───────────────────────────────────

  async getDealPayments(dealId: string): Promise<PaymentResult<DealPaymentView>> {
    const deal = await this.payments.getDealContext(dealId);
    if (!deal) return failPayment({ code: "DEAL_NOT_FOUND", message: "Deal not found." });
    const rows = await this.payments.listForDeal(dealId);
    return okPayment({ deal, summary: computeBalance(deal.agreedPrice, rows), payments: rows });
  }

  listRecent(options: { limit: number; since?: string; status?: PaymentStatus; method?: PaymentMethod }) {
    return this.payments.listRecent(options);
  }

  totalsByMethod(since: string) {
    return this.payments.totalsByMethod(since);
  }

  getCustomer(customerId: string) {
    return this.payments.getCustomer(customerId);
  }

  parseSms(text: string): SmsParseResult {
    return parseMpesaSms(text.slice(0, 2000));
  }

  // ───────────────────────────── M-Pesa account (credentials) ─────────────────────────────

  getAccount(): Promise<PaymentAccountPublic | null> {
    return this.accounts.getPublic();
  }

  /** Verifies the credentials with Safaricom BEFORE saving them (a typo or someone else's keys fail here). Caller must have re-authenticated the owner. */
  async connectAccount(
    input: { environment: string; transactionType: string; shortcode: string; tillNumber: string; consumerKey: string; consumerSecret: string; passkey: string },
    actorUserId: string
  ): Promise<PaymentResult<PaymentAccountPublic>> {
    const errors: Record<string, string> = {};
    const environment = input.environment === "production" ? "production" : input.environment === "sandbox" ? "sandbox" : null;
    const transactionType = input.transactionType === "till" ? "till" : input.transactionType === "paybill" ? "paybill" : null;
    if (!environment) errors.environment = "Choose sandbox or production.";
    if (!transactionType) errors.transactionType = "Choose paybill or till.";
    const shortcode = input.shortcode.trim();
    if (!/^\d{5,7}$/.test(shortcode)) errors.shortcode = "Enter your 5–7 digit shortcode.";
    const tillNumber = input.tillNumber.trim();
    if (tillNumber && !/^\d{5,8}$/.test(tillNumber)) errors.tillNumber = "Till number must be digits only.";
    const consumerKey = input.consumerKey.trim();
    const consumerSecret = input.consumerSecret.trim();
    const passkey = input.passkey.trim();
    for (const [name, value] of [["consumerKey", consumerKey], ["consumerSecret", consumerSecret], ["passkey", passkey]] as const) {
      if (value.length < 20 || value.length > 200 || /\s/.test(value)) errors[name] = "This looks wrong. Copy it again from the Daraja portal.";
    }
    if (Object.keys(errors).length > 0 || !environment || !transactionType) {
      return failPayment({ code: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fieldErrors: errors as PaymentFieldErrors });
    }

    const config: DarajaConfig = { environment: environment as DarajaEnvironment, transactionType: transactionType as DarajaTransactionType, shortcode, tillNumber: tillNumber || null, consumerKey, consumerSecret, passkey };
    try {
      await this.client(config).verifyCredentials();
    } catch (error) {
      return failPayment({ code: "PROVIDER_ERROR", message: error instanceof DarajaError ? error.message : "Could not verify these credentials with M-Pesa." });
    }
    await this.accounts.save({ ...config });
    await this.payments.recordEvent({ actorUserId, action: "mpesa_account_connected", detail: { environment, shortcode, transactionType } });
    return okPayment((await this.accounts.getPublic())!);
  }

  async disconnectAccount(actorUserId: string): Promise<void> {
    await this.accounts.remove();
    await this.payments.recordEvent({ actorUserId, action: "mpesa_account_disconnected" });
  }
}
