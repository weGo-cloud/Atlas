import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BALANCE_STATUS_LABEL } from "../domain/balance";
import type { DealPaymentView } from "../service/payment-service";
import { PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, type Payment } from "../domain/payment";
import { formatKes } from "../lib/format";
import { MpesaStkForm, PaymentRowActions, RecordPaymentForm } from "./payment-forms";

const statusClass: Record<Payment["status"], string> = {
  confirmed: "text-success",
  pending: "text-amber-600",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
  reversed: "text-muted-foreground line-through",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Mission 040 — the Payments panel on a deal: balance, every payment with its evidence, and the ways to take more. */
export function DealPaymentsCard({
  view,
  customerPhone,
  canReverse,
  stk,
}: {
  view: DealPaymentView;
  customerPhone: string | null;
  canReverse: boolean;
  /** Why a prompt can/can't be sent right now. */
  stk: { ready: boolean; reason: string | null };
}) {
  const { deal, summary, payments } = view;
  const terminal = deal.status === "cancelled";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Payments</CardTitle>
        <Badge variant={summary.status === "paid" ? "success" : summary.status === "overpaid" ? "warning" : "default"}>{BALANCE_STATUS_LABEL[summary.status]}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-0">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Agreed price</dt><dd className="font-medium">{formatKes(summary.agreedPrice)}</dd></div>
          <div><dt className="text-muted-foreground">Paid</dt><dd className="font-medium">{formatKes(summary.netPaid)}</dd></div>
          <div><dt className="text-muted-foreground">{summary.balance < 0 ? "Overpaid by" : "Balance"}</dt><dd className="font-medium">{formatKes(Math.abs(summary.balance))}</dd></div>
          <div><dt className="text-muted-foreground">Awaiting confirmation</dt><dd className="font-medium">{formatKes(summary.pending)}</dd></div>
        </dl>

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {p.kind === "refund" ? "−" : ""}
                    {formatKes(p.amount)} <span className="font-normal text-muted-foreground">· {PAYMENT_KIND_LABEL[p.kind]} · {PAYMENT_METHOD_LABEL[p.method]}</span>
                  </span>
                  <span className={`text-xs font-medium ${statusClass[p.status]}`}>{PAYMENT_STATUS_LABEL[p.status]}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {when(p.paidAt)}
                  {p.reference ? ` · Ref ${p.reference}` : ""}
                  {p.payerPhone ? ` · ${p.payerPhone}` : ""}
                  {p.verification === "provider" && p.status === "confirmed" ? " · Verified by M-Pesa" : ""}
                  {p.verification === "manual" && (p.method === "mpesa" || p.method === "airtel_money") ? " · Manual entry (unverified)" : ""}
                </p>
                {p.failureReason && p.status !== "confirmed" ? <p className="text-xs text-muted-foreground">{p.failureReason}</p> : null}
                {p.reversedReason ? <p className="text-xs text-muted-foreground">Reversed: {p.reversedReason}</p> : null}
                {p.notes ? <p className="text-xs text-muted-foreground">{p.notes}</p> : null}
                <PaymentRowActions payment={p} dealId={deal.id} canReverse={canReverse} />
              </li>
            ))}
          </ul>
        )}

        {terminal ? (
          <p className="text-sm text-muted-foreground">This deal is cancelled, so it can&apos;t take new payments.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Request payment by M-Pesa</h3>
              {stk.ready ? <MpesaStkForm dealId={deal.id} defaultPhone={customerPhone} defaultAmount={summary.collectable} /> : <p className="text-sm text-muted-foreground">{stk.reason}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Record a payment received</h3>
              <RecordPaymentForm customerId={deal.customerId} dealId={deal.id} defaultAmount={summary.collectable} defaultPhone={customerPhone} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
