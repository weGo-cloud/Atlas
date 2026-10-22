import type { SubscriptionPlan } from "@/features/entitlements/domain/plan";

/**
 * Mission 041 — automated plan billing rules (pure, deterministic: `now` is always passed in).
 *
 * Honest model of "auto-renew": M-Pesa has no silent card-on-file charge. Each cycle Atlas creates the invoice ahead of time
 * and sends the owner an M-Pesa prompt on a schedule; approving it with their PIN pays it. (A standing-order rail such as
 * Safaricom's Ratiba can later replace the prompt without changing anything here: the invoice/settlement rules are the same.)
 */
export const RENEWAL_LEAD_DAYS = 3;
/** Days relative to the due date at which a prompt is (re)sent while the invoice is open: 3 days before, on the day, +2, +5. */
export const PROMPT_OFFSET_DAYS = [-3, 0, 2, 5] as const;
/** After this many days past due with no payment, the invoice becomes uncollectible and the business drops to the free Starter plan (no data is touched). */
export const GRACE_DAYS = 7;
/** Minimum gap between prompts, and how long a prompt is given to resolve before it is re-checked and may be re-sent. */
export const PROMPT_COOLDOWN_MS = 15 * 60_000;

export const INVOICE_STATUSES = ["open", "paid", "uncollectible", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type InvoiceKind = "upgrade" | "renewal";
export type PaymentState = "none" | "pending" | "failed";

export type BillingInvoice = {
  id: string;
  businessId: string;
  plan: SubscriptionPlan;
  amount: number;
  currency: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  checkoutRequestId: string | null;
  payerPhone: string | null;
  paymentState: PaymentState;
  receipt: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

/** Adds whole calendar months in UTC, clamping to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb, never 3 Mar). */
export function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

/** The moments (ms) at which prompt number 0,1,2,3 become due for an invoice. */
export function promptSchedule(dueAtIso: string): number[] {
  const due = new Date(dueAtIso).getTime();
  return PROMPT_OFFSET_DAYS.map((days) => due + days * 86_400_000);
}

/** Whether another prompt should go out now: schedule reached, attempts remain, and the previous prompt had time to resolve. */
export function isPromptDue(invoice: Pick<BillingInvoice, "attempts" | "lastAttemptAt" | "dueAt" | "status">, now: Date): boolean {
  if (invoice.status !== "open") return false;
  const schedule = promptSchedule(invoice.dueAt);
  if (invoice.attempts >= schedule.length) return false;
  if (now.getTime() < schedule[invoice.attempts]) return false;
  if (invoice.lastAttemptAt && now.getTime() - new Date(invoice.lastAttemptAt).getTime() < PROMPT_COOLDOWN_MS) return false;
  return true;
}

export function isPastGrace(invoice: Pick<BillingInvoice, "dueAt">, now: Date): boolean {
  return now.getTime() > new Date(invoice.dueAt).getTime() + GRACE_DAYS * 86_400_000;
}
