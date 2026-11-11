import Link from "next/link";
import { Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/features/payments/domain/payment";
import { formatKes } from "@/features/payments/lib/format";
import { getPaymentService } from "@/features/payments/service";

export const metadata = { title: "Payments · Atlas" };

const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function PaymentsPage() {
  const { business } = await requireCurrentSession();
  const service = getPaymentService(business.id);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [recent, totals] = await Promise.all([service.listRecent({ limit: 50 }), service.totalsByMethod(monthStart)]);
  const received = totals.reduce((s, t) => s + t.received, 0);
  const refunded = totals.reduce((s, t) => s + t.refunded, 0);
  const unverified = totals.reduce((s, t) => s + t.unverifiedManual, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">Money received this month and the latest payments. Record payments from a deal.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This month</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Received</dt><dd className="text-lg font-semibold">{formatKes(received - refunded)}</dd></div>
            <div><dt className="text-muted-foreground">Refunded</dt><dd className="font-medium">{formatKes(refunded)}</dd></div>
            <div><dt className="text-muted-foreground">Mobile money entered by hand</dt><dd className="font-medium">{formatKes(unverified)}</dd></div>
          </dl>
          {totals.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {totals.map((t) => (
                <li key={t.method} className="flex items-center justify-between p-3">
                  <span>{PAYMENT_METHOD_LABEL[t.method]} <span className="text-muted-foreground">· {t.count} payment{t.count === 1 ? "" : "s"}</span></span>
                  <span className="font-medium">{formatKes(t.received - t.refunded)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No confirmed payments this month yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest payments</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {recent.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="font-medium">{p.kind === "refund" ? "−" : ""}{formatKes(p.amount)}</span>{" "}
                    <span className="text-muted-foreground">· {p.customerName ?? "Customer"} · {PAYMENT_KIND_LABEL[p.kind]} · {PAYMENT_METHOD_LABEL[p.method]}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[p.status]} · {when(p.paidAt)}
                    {p.dealId ? (
                      <>
                        {" · "}
                        <Link href={`/app/deals/${p.dealId}`} className="underline">Deal</Link>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
