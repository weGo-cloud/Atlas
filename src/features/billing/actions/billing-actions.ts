"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { PaymentFieldErrors, PaymentResult } from "@/features/payments/domain/errors";
import { BillingService } from "../service/billing-service";

export type BillingActionResult = { ok: true; message: string } | { ok: false; error: { message: string; fieldErrors?: PaymentFieldErrors } };

async function ownerSession() {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
  return session;
}

const wrap = (result: PaymentResult<{ message: string }>): BillingActionResult =>
  result.ok ? { ok: true, message: result.data.message } : { ok: false, error: { message: result.error.message, fieldErrors: result.error.fieldErrors } };

/** Owner pays for a plan by M-Pesa. The price comes from the server-side catalog; only the plan and the phone come from the browser. */
export async function startPlanPaymentAction(plan: unknown, phone: unknown): Promise<BillingActionResult> {
  const session = await ownerSession();
  if (!session) return { ok: false, error: { message: "Only the business owner can change the plan." } };
  const result = await new BillingService().startUpgrade(session.business.id, plan, phone, session.user.id);
  revalidatePath("/app/settings");
  return wrap(result);
}

export async function payOpenInvoiceAction(phone: unknown): Promise<BillingActionResult> {
  const session = await ownerSession();
  if (!session) return { ok: false, error: { message: "Only the business owner can pay the plan invoice." } };
  const result = await new BillingService().payOpenInvoice(session.business.id, phone, session.user.id);
  revalidatePath("/app/settings");
  return wrap(result);
}

export async function refreshInvoiceAction(): Promise<BillingActionResult> {
  const session = await ownerSession();
  if (!session) return { ok: false, error: { message: "Only the business owner can check this." } };
  const result = await new BillingService().refreshOpenInvoice(session.business.id);
  revalidatePath("/app/settings");
  return wrap(result);
}
