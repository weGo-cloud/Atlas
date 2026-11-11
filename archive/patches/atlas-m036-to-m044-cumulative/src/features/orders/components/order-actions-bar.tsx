"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelOrderAction, confirmOrderAction, fulfilOrderAction, type OrderActionResult } from "../actions/order-actions";

/** Mission 042 — status actions for an order. The server enforces every rule; this only offers the valid next steps. */
export function OrderActionsBar({ orderId, status }: { orderId: string; status: "draft" | "confirmed" | "fulfilled" | "cancelled" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<OrderActionResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const run = (fn: () => Promise<OrderActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setCancelling(false);
        setReason("");
        router.refresh();
      }
    });

  if (status === "fulfilled" || status === "cancelled") return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? <Button disabled={pending} onClick={() => run(() => confirmOrderAction(orderId))}>Confirm order</Button> : null}
        {status === "confirmed" ? <Button disabled={pending} onClick={() => run(() => fulfilOrderAction(orderId))}>Mark fulfilled</Button> : null}
        <Button variant="outline" disabled={pending} onClick={() => setCancelling((c) => !c)}>Cancel order</Button>
      </div>
      {cancelling ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Why is it being cancelled?" className="h-9 max-w-xs" />
          <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={() => run(() => cancelOrderAction(orderId, reason))}>Confirm cancellation</Button>
        </div>
      ) : null}
      {result ? (result.ok ? <p role="status" className="text-sm text-success">{result.message}</p> : <p role="alert" className="text-sm text-destructive">{result.error.message}</p>) : null}
    </div>
  );
}
