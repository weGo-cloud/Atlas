"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrderAction, type OrderActionResult } from "../actions/order-actions";

type Customer = { id: string; name: string; phone: string | null };
type Product = { id: string; name: string; price: number; stock: number };
type Line = { productId: string; quantity: string };

const kes = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

/** Mission 042 — create a draft furniture order: pick a customer, add items, optional delivery/discount. Confirming (which commits stock) happens on the order page. */
export function NewOrderForm({ customers, products }: { customers: Customer[]; products: Product[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<OrderActionResult<{ id: string }> | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1" }]);
  const [v, setV] = useState({ deliveryFee: "", discount: "", deliveryAddress: "", deliveryDate: "", notes: "" });
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const subtotal = lines.reduce((sum, l) => sum + (byId.get(l.productId)?.price ?? 0) * (Number.parseInt(l.quantity, 10) || 0), 0);
  const total = subtotal + (Number(v.deliveryFee.replace(/\D/g, "")) || 0) - (Number(v.discount.replace(/\D/g, "")) || 0);
  const fieldError = (name: string) => (result && !result.ok ? (result.error.fieldErrors as Record<string, string> | undefined)?.[name] : undefined);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createOrderAction({
        customerId,
        lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number.parseInt(l.quantity, 10) })),
        ...v,
        deliveryDate: v.deliveryDate ? new Date(v.deliveryDate).toISOString() : "",
      });
      setResult(r);
      if (r.ok && r.data) router.push(`/app/orders/${r.data.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5">
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="ord-customer">Customer</Label>
        <select id="ord-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={selectClass} required>
          <option value="">Choose a customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
        </select>
        {fieldError("customerId") ? <p className="text-xs text-destructive">{fieldError("customerId")}</p> : null}
        {customers.length === 0 ? <p className="text-xs text-muted-foreground">No customers yet. Customers are created from leads.</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Items</Label>
        {lines.map((l, i) => {
          const p = byId.get(l.productId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label={`Item ${i + 1}`} value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className={`${selectClass} max-w-sm`}>
                <option value="">Choose a product…</option>
                {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} · {kes(pr.price)} · {pr.stock} in stock</option>)}
              </select>
              <Input aria-label={`Quantity ${i + 1}`} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="h-10 w-20" />
              <span className="text-sm text-muted-foreground">{p ? kes(p.price * (Number.parseInt(l.quantity, 10) || 0)) : ""}</span>
              {lines.length > 1 ? <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>Remove</Button> : null}
            </div>
          );
        })}
        {fieldError("lines") ? <p className="text-xs text-destructive">{fieldError("lines")}</p> : null}
        <div><Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { productId: "", quantity: "1" }])}>Add another item</Button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="ord-fee">Delivery fee (KSh)</Label><Input id="ord-fee" inputMode="numeric" value={v.deliveryFee} onChange={(e) => setV((s) => ({ ...s, deliveryFee: e.target.value }))} />{fieldError("deliveryFee") ? <p className="text-xs text-destructive">{fieldError("deliveryFee")}</p> : null}</div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ord-disc">Discount (KSh)</Label><Input id="ord-disc" inputMode="numeric" value={v.discount} onChange={(e) => setV((s) => ({ ...s, discount: e.target.value }))} />{fieldError("discount") ? <p className="text-xs text-destructive">{fieldError("discount")}</p> : null}</div>
        <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="ord-addr">Delivery address (optional)</Label><Input id="ord-addr" value={v.deliveryAddress} maxLength={300} onChange={(e) => setV((s) => ({ ...s, deliveryAddress: e.target.value }))} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ord-date">Delivery date (optional)</Label><Input id="ord-date" type="date" value={v.deliveryDate} onChange={(e) => setV((s) => ({ ...s, deliveryDate: e.target.value }))} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ord-notes">Notes (optional)</Label><Input id="ord-notes" value={v.notes} maxLength={500} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} /></div>
      </div>

      <p className="text-sm">Order total: <span className="text-lg font-semibold">{kes(Math.max(total, 0))}</span></p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create draft order"}</Button>
        {result && !result.ok ? <p role="alert" className="text-sm text-destructive">{result.error.message}</p> : null}
      </div>
    </form>
  );
}
