"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { allocateC2bAction, ignoreC2bAction, type PaymentActionResult } from "../actions/payment-actions";

type Item = { id: string; transId: string; amountKes: number | null; amountRaw: string; billRef: string | null; payerPhone: string | null; payerName: string | null; paidAt: string; suggestion: { kind: "deal" | "order"; id: string } | null };
type Target = { kind: "deal" | "order"; id: string; label: string; customerName: string | null; collectable: number };

const kes = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Row({ item, targets }: { item: Item; targets: Target[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PaymentActionResult | null>(null);
  const [choice, setChoice] = useState(item.suggestion ? `${item.suggestion.kind}:${item.suggestion.id}` : "");
  const run = (fn: () => Promise<PaymentActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });
  const [kind, id] = choice.split(":");

  return (
    <li className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{item.amountKes !== null ? kes(item.amountKes) : `KSh ${item.amountRaw}`} <span className="font-normal text-muted-foreground">· {item.transId}</span></span>
        <span className="text-xs text-muted-foreground">{when(item.paidAt)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {item.payerName ?? "Unknown payer"}
        {item.payerPhone ? ` · ${item.payerPhone}` : ""}
        {item.billRef ? ` · Account “${item.billRef}”` : ""}
        {item.suggestion ? " · Suggested match selected" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Allocate to" value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9 max-w-sm rounded-md border bg-background px-2 text-sm">
          <option value="">Allocate to a deal or order…</option>
          {targets.map((t) => <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>{t.kind === "order" ? "Order" : "Deal"} · {t.label} · {t.customerName ?? "Customer"} · {kes(t.collectable)} due</option>)}
        </select>
        <Button size="sm" disabled={pending || !choice || item.amountKes === null} onClick={() => run(() => allocateC2bAction(item.id, { kind, id }))}>Allocate</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => ignoreC2bAction(item.id))}>Not a sale</Button>
      </div>
      {item.amountKes === null ? <p className="text-xs text-muted-foreground">This payment has cents, so record it by hand with the whole-shilling amount.</p> : null}
      {result ? (result.ok ? <p role="status" className="text-xs text-success">{result.message}</p> : <p role="alert" className="text-xs text-destructive">{result.error.message}</p>) : null}
    </li>
  );
}

/** Mission 043 — payments customers made straight to the till/paybill, waiting for a person to say what they were for. */
export function C2bInboxCard({ items, targets }: { items: Item[]; targets: Target[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments to your till waiting for you</CardTitle>
        <CardDescription>
          M-Pesa told us these customers paid your till or paybill. Atlas never credits them automatically (the notification can&apos;t be verified independently), so pick what each one was for.
          Allocated payments are marked “Reported by M-Pesa”; check them against your M-Pesa statement.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="flex flex-col divide-y border-t">{items.map((i) => <Row key={i.id} item={i} targets={targets} />)}</ul>
      </CardContent>
    </Card>
  );
}
