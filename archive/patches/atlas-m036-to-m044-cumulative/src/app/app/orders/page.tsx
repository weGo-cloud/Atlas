import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/features/orders/domain/order";
import { getOrderService } from "@/features/orders/service/order-service";
import { formatKes } from "@/features/payments/lib/format";

export const metadata = { title: "Orders · Atlas" };

const VARIANT: Record<OrderStatus, "default" | "primary" | "success" | "destructive"> = { draft: "default", confirmed: "primary", fulfilled: "success", cancelled: "destructive" };
const day = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("en-KE", { day: "2-digit", month: "short" });

export default async function OrdersPage() {
  const { business } = await requireCurrentSession();
  if (business.vertical !== "furniture") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">Orders are for furniture businesses. Vehicle businesses track each sale as a deal. <Link href="/app/deals" className="underline">Go to Deals</Link>.</p>
      </div>
    );
  }
  const orders = await getOrderService(business.id).list({ limit: 100 });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
            <p className="text-sm text-muted-foreground">Confirm an order to reserve stock, then take payments against it.</p>
          </div>
        </div>
        <Link href="/app/orders/new" className={buttonVariants()}>New order</Link>
      </div>
      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/app/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-muted/50">
                    <span>
                      <span className="font-medium">{o.reference}</span> <span className="text-muted-foreground">· {o.customerName ?? "Customer"} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {day(o.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium">{formatKes(o.total)}</span>
                      <Badge variant={VARIANT[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
