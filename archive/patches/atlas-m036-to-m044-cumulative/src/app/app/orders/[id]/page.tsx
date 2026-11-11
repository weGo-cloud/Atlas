import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { OrderActionsBar } from "@/features/orders/components/order-actions-bar";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/features/orders/domain/order";
import { getOrderService } from "@/features/orders/service/order-service";
import { DealPaymentsCard } from "@/features/payments/components/deal-payments-card";
import { formatKes } from "@/features/payments/lib/format";
import { getPaymentService } from "@/features/payments/service";
import { getStkReadiness } from "@/features/payments/service/stk-readiness";

export const metadata = { title: "Order · Atlas" };

const VARIANT: Record<OrderStatus, "default" | "primary" | "success" | "destructive"> = { draft: "default", confirmed: "primary", fulfilled: "success", cancelled: "destructive" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business, user } = await requireCurrentSession();
  if (business.vertical !== "furniture") notFound();
  const order = await getOrderService(business.id).get(id);
  if (!order) notFound();

  const paymentService = getPaymentService(business.id);
  const [paymentView, customer, stk] = await Promise.all([paymentService.getOrderPayments(order.id), paymentService.getCustomer(order.customerId), getStkReadiness(business.id)]);
  const blockedReason = order.status === "draft" ? "Confirm the order to start taking payments. Confirming reserves the stock." : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground"><Link href="/app/orders" className="underline">Orders</Link> / {order.reference}</p>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-foreground">
            {order.reference} <Badge variant={VARIANT[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">{order.customerName ?? "Customer"} · created {when(order.createdAt)}</p>
        </div>
        <OrderActionsBar orderId={order.id} status={order.status} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {order.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>{l.name} <span className="text-muted-foreground">× {l.quantity} · {formatKes(l.unitPrice)} each</span></span>
                <span className="font-medium">{formatKes(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right">{formatKes(order.subtotal)}</dd>
            {order.deliveryFee > 0 ? (<><dt className="text-muted-foreground">Delivery</dt><dd className="text-right">{formatKes(order.deliveryFee)}</dd></>) : null}
            {order.discount > 0 ? (<><dt className="text-muted-foreground">Discount</dt><dd className="text-right">−{formatKes(order.discount)}</dd></>) : null}
            <dt className="font-medium">Total</dt><dd className="text-right font-semibold">{formatKes(order.total)}</dd>
          </dl>
          {order.deliveryAddress || order.deliveryDate || order.notes ? (
            <p className="text-sm text-muted-foreground">
              {order.deliveryAddress ? `Deliver to ${order.deliveryAddress}. ` : ""}
              {order.deliveryDate ? `Delivery ${when(order.deliveryDate)}. ` : ""}
              {order.notes}
            </p>
          ) : null}
          {order.cancelledReason ? <p className="text-sm text-muted-foreground">Cancelled: {order.cancelledReason}</p> : null}
        </CardContent>
      </Card>

      {paymentView.ok ? (
        <DealPaymentsCard view={paymentView.data} customerPhone={customer?.phone ?? null} canReverse={user.role === "owner"} stk={stk} subject={{ kind: "order", id: order.id }} blockedReason={blockedReason} />
      ) : null}
    </div>
  );
}
