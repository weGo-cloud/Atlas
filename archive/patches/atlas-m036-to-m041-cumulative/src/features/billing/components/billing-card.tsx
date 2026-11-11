"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { payOpenInvoiceAction, refreshInvoiceAction, startPlanPaymentAction, type BillingActionResult } from "../actions/billing-actions";

type Props = {
  canManage: boolean;
  currentPlan: string;
  periodEnd: string | null;
  autoRenew: boolean;
  savedPhone: string | null;
  plans: Array<{ id: string; name: string; amount: number }>;
  openInvoice: { amount: number; plan: string; dueAt: string; kind: string; paymentState: string; failureReason: string | null } | null;
};

const kes = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

/** Mission 041 — pay for / renew a plan by M-Pesa. Only shown when the server has billing configured. */
export function BillingCard({ canManage, currentPlan, periodEnd, autoRenew, savedPhone, plans, openInvoice }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BillingActionResult | null>(null);
  const [phone, setPhone] = useState(savedPhone ?? "");
  const run = (fn: () => Promise<BillingActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });
  const phoneError = result && !result.ok ? result.error.fieldErrors?.phone : undefined;
  const upgradable = plans.filter((p) => p.id !== currentPlan);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pay for your plan</CardTitle>
        <CardDescription>
          Pay by M-Pesa from your phone. You approve a prompt with your PIN; your plan activates the moment M-Pesa confirms it.
          {periodEnd ? ` Paid through ${day(periodEnd)}.` : ""}
          {autoRenew && periodEnd ? " Before each renewal we send you a prompt (3 days ahead, on the day, and reminders after). If it stays unpaid for 7 days after the due date you move to the free plan: your data is never deleted." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canManage ? <p className="text-sm text-muted-foreground">Only the business owner can pay for the plan.</p> : null}

        {openInvoice ? (
          <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            <p className="font-medium">
              {openInvoice.kind === "renewal" ? "Renewal" : "Plan payment"}: {kes(openInvoice.amount)} · due {day(openInvoice.dueAt)}
            </p>
            {openInvoice.paymentState === "pending" ? <p className="text-muted-foreground">A prompt was sent. Approve it on your phone, then tap “Check status”.</p> : null}
            {openInvoice.paymentState === "failed" && openInvoice.failureReason ? <p className="text-muted-foreground">{openInvoice.failureReason}</p> : null}
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={pending} onClick={() => run(() => payOpenInvoiceAction(phone))}>Send M-Pesa prompt</Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => refreshInvoiceAction())}>Check status</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-3">
            <div className="flex max-w-xs flex-col gap-1.5">
              <Label htmlFor="bill-phone">M-Pesa number to charge</Label>
              <Input id="bill-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {phoneError ? <p className="text-xs text-destructive">{phoneError}</p> : null}
            </div>
            {!openInvoice && upgradable.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {upgradable.map((p) => (
                  <Button key={p.id} variant="outline" disabled={pending || phone.trim() === ""} onClick={() => run(() => startPlanPaymentAction(p.id, phone))}>
                    {pending ? "Sending…" : `Pay ${kes(p.amount)} for ${p.name}`}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (result.ok ? <p role="status" className="text-sm text-success">{result.message}</p> : <p role="alert" className="text-sm text-destructive">{result.error.message}</p>) : null}
      </CardContent>
    </Card>
  );
}
