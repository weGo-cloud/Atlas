"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { PaymentFieldErrors, PaymentResult } from "../domain/errors";
import type { PaymentKind } from "../domain/payment";
import { isPaymentKind } from "../domain/payment";
import { confirmPassword } from "../lib/step-up";
import { getPaymentService } from "../service";

export type PaymentActionResult<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; error: { message: string; fieldErrors?: PaymentFieldErrors } };

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.slice(0, max) : "");
const idOf = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(v) ? v : null);

function refresh(dealId: unknown) {
  const id = idOf(dealId);
  if (id) revalidatePath(`/app/deals/${id}`);
  revalidatePath("/app/payments");
}

function fromResult<T, D = undefined>(result: PaymentResult<T>, message: string, map?: (data: T) => D): PaymentActionResult<D> {
  if (!result.ok) return { ok: false, error: { message: result.error.message, fieldErrors: result.error.fieldErrors } };
  return { ok: true, message, data: map ? map(result.data) : undefined };
}

export async function recordPaymentAction(input: Record<string, unknown>): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  const customerId = idOf(input.customerId);
  if (!customerId) return { ok: false, error: { message: "Customer not found." } };
  const result = await getPaymentService(session.business.id).recordPayment(
    {
      customerId,
      dealId: idOf(input.dealId),
      amount: input.amount,
      method: input.method,
      kind: input.kind,
      reference: input.reference,
      payerPhone: input.payerPhone,
      payerName: input.payerName,
      itemLabel: input.itemLabel,
      paidAt: input.paidAt,
      notes: input.notes,
    },
    session.user.id
  );
  if (result.ok) refresh(input.dealId);
  return fromResult(result, result.ok && result.data.status === "pending" ? "Recorded as pending until it clears." : "Payment recorded.");
}

export async function requestMpesaStkAction(input: Record<string, unknown>): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  const dealId = idOf(input.dealId);
  const kind: PaymentKind = isPaymentKind(input.kind) ? input.kind : "installment";
  if (!dealId) return { ok: false, error: { message: "Deal not found." } };
  const result = await getPaymentService(session.business.id).requestMpesaStk({ dealId, phone: input.phone, amount: input.amount, kind }, session.user.id);
  if (result.ok) refresh(dealId);
  return fromResult(result, result.ok ? result.data.customerMessage : "");
}

export async function refreshStkAction(paymentId: unknown, dealId: unknown): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  const id = idOf(paymentId);
  if (!id) return { ok: false, error: { message: "Payment not found." } };
  const result = await getPaymentService(session.business.id).refreshStk(id, session.user.id);
  if (result.ok) refresh(dealId);
  const labels = { confirmed: "Payment confirmed by M-Pesa.", failed: "M-Pesa reports the payment failed.", cancelled: "The prompt was cancelled or expired.", pending: "Still waiting for the customer to respond.", ignored: "Already up to date." } as const;
  return fromResult(result, result.ok ? labels[result.data.outcome] : "");
}

export async function settlePendingAction(paymentId: unknown, outcome: unknown, dealId: unknown, reason?: unknown): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  const id = idOf(paymentId);
  if (!id || (outcome !== "confirmed" && outcome !== "failed")) return { ok: false, error: { message: "Payment not found." } };
  const result = await getPaymentService(session.business.id).settlePending(id, outcome, session.user.id, str(reason, 200));
  if (result.ok) refresh(dealId);
  return fromResult(result, outcome === "confirmed" ? "Cheque marked as cleared." : "Cheque marked as bounced.");
}

export async function reversePaymentAction(paymentId: unknown, reason: unknown, dealId: unknown): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "payment.reverse");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: { message: "Only the business owner can reverse a payment." } };
    throw error;
  }
  const id = idOf(paymentId);
  if (!id) return { ok: false, error: { message: "Payment not found." } };
  const result = await getPaymentService(session.business.id).reversePayment(id, str(reason, 300), session.user.id);
  if (result.ok) refresh(dealId);
  return fromResult(result, "Payment reversed.");
}

export async function attachReferenceAction(paymentId: unknown, reference: unknown, dealId: unknown): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  const id = idOf(paymentId);
  if (!id) return { ok: false, error: { message: "Payment not found." } };
  const result = await getPaymentService(session.business.id).attachReference(id, str(reference, 40), session.user.id);
  if (result.ok) refresh(dealId);
  return fromResult(result, "Receipt added.");
}

/** Parses a pasted M-Pesa SMS for the record form. Saves nothing. */
export async function parseMpesaSmsAction(text: unknown): Promise<PaymentActionResult<{ receipt: string; amount: number | null; phone: string | null; name: string | null; paidAt: string | null }>> {
  const session = await requireCurrentSession();
  const parsed = getPaymentService(session.business.id).parseSms(str(text, 2000));
  if (!parsed.ok) return { ok: false, error: { message: parsed.reason } };
  const v = parsed.value;
  return {
    ok: true,
    message: v.amountIsWhole ? "Filled from the message. Check it, then save." : "Filled from the message, but the amount has cents: enter the whole-shilling amount yourself.",
    data: { receipt: v.receipt, amount: v.amountIsWhole ? v.amount : null, phone: v.phone, name: v.name, paidAt: v.paidAt },
  };
}

/**
 * Connects the business's own M-Pesa (Daraja) account. Owner-only, plan-gated, re-asks for the password (step-up), and the
 * credentials are verified with Safaricom before they are stored encrypted.
 */
export async function connectMpesaAccountAction(input: Record<string, unknown>): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: { message: "Only the business owner can connect an M-Pesa account." } };
    throw error;
  }
  if (!(await confirmPassword(session.user, input.currentPassword))) {
    return { ok: false, error: { message: "Your password wasn't accepted. Re-enter your sign-in password to change payment settings.", fieldErrors: undefined } };
  }
  const { isEncryptionConfigured } = await import("@/lib/security/secret-box");
  if (!isEncryptionConfigured()) return { ok: false, error: { message: "The server has no ATLAS_ENCRYPTION_KEY configured, so credentials can't be stored safely yet." } };

  const result = await getPaymentService(session.business.id).connectAccount(
    {
      environment: str(input.environment, 20),
      transactionType: str(input.transactionType, 20),
      shortcode: str(input.shortcode, 20),
      tillNumber: str(input.tillNumber, 20),
      consumerKey: str(input.consumerKey, 250),
      consumerSecret: str(input.consumerSecret, 250),
      passkey: str(input.passkey, 250),
    },
    session.user.id
  );
  if (result.ok) revalidatePath("/app/settings");
  return fromResult(result, "M-Pesa connected. Credentials verified and stored encrypted.");
}

export async function disconnectMpesaAccountAction(currentPassword: unknown): Promise<PaymentActionResult> {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: { message: "Only the business owner can disconnect M-Pesa." } };
    throw error;
  }
  if (!(await confirmPassword(session.user, currentPassword))) return { ok: false, error: { message: "Your password wasn't accepted." } };
  await getPaymentService(session.business.id).disconnectAccount(session.user.id);
  revalidatePath("/app/settings");
  return { ok: true, message: "M-Pesa disconnected." };
}
