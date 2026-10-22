"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  attachReferenceAction,
  parseMpesaSmsAction,
  recordPaymentAction,
  refreshStkAction,
  requestMpesaStkAction,
  reversePaymentAction,
  settlePendingAction,
  type PaymentActionResult,
} from "../actions/payment-actions";
import type { PaymentFieldErrors } from "../domain/errors";
import { PAYMENT_KIND_LABEL, PAYMENT_KINDS, PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type Payment } from "../domain/payment";

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

function Notice({ result }: { result: PaymentActionResult<unknown> | null }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm text-success">{result.message}</p>
  ) : (
    <p role="alert" className="text-sm text-destructive">{result.error.message}</p>
  );
}

const fieldError = (result: PaymentActionResult<unknown> | null, name: keyof PaymentFieldErrors) =>
  result && !result.ok ? result.error.fieldErrors?.[name] : undefined;

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Record a payment by hand: cash, M-Pesa receipt, bank, cheque, card, financing, trade-in. Includes "paste the M-Pesa SMS". */
export function RecordPaymentForm({ customerId, dealId, defaultAmount, defaultPhone }: { customerId: string; dealId: string | null; defaultAmount: number; defaultPhone: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PaymentActionResult<unknown> | null>(null);
  const [v, setV] = useState({ amount: defaultAmount > 0 ? String(defaultAmount) : "", method: "cash", kind: "installment", reference: "", payerPhone: defaultPhone ?? "", payerName: "", paidAt: "", notes: "", sms: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const needsRef = ["mpesa", "airtel_money", "bank_transfer", "cheque", "card"].includes(v.method);
  const refLabel = v.method === "mpesa" ? "M-Pesa receipt code" : v.method === "cheque" ? "Cheque number" : v.method === "airtel_money" ? "Airtel transaction ID" : v.method === "bank_transfer" ? "Bank reference" : "Reference (optional)";

  const fillFromSms = () =>
    start(async () => {
      const r = await parseMpesaSmsAction(v.sms);
      setResult(r);
      if (r.ok && r.data) {
        const d = r.data;
        setV((s) => ({ ...s, method: "mpesa", reference: d.receipt, amount: d.amount !== null ? String(d.amount) : s.amount, payerPhone: d.phone ?? s.payerPhone, payerName: d.name ?? s.payerName, paidAt: d.paidAt ? d.paidAt.slice(0, 16) : s.paidAt }));
      }
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await recordPaymentAction({ customerId, dealId, ...v, paidAt: v.paidAt ? new Date(v.paidAt).toISOString() : "" });
      setResult(r);
      if (r.ok) {
        setV((s) => ({ ...s, amount: "", reference: "", notes: "", sms: "" }));
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
        <Label htmlFor="pay-sms">Paste an M-Pesa message (optional)</Label>
        <textarea id="pay-sms" value={v.sms} onChange={set("sms")} rows={2} maxLength={2000} className="w-full rounded-md border bg-background px-2 py-1 text-sm" placeholder="SJK4X9ABCD Confirmed. Ksh2,500.00 received from …" />
        <div>
          <Button type="button" variant="outline" size="sm" onClick={fillFromSms} disabled={pending || v.sms.trim() === ""}>Fill from message</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (KSh)" id="pay-amount" error={fieldError(result, "amount")}>
          <Input id="pay-amount" inputMode="numeric" value={v.amount} onChange={set("amount")} required />
        </Field>
        <Field label="Payment type" id="pay-kind" error={fieldError(result, "kind")}>
          <select id="pay-kind" value={v.kind} onChange={set("kind")} className={selectClass}>
            {PAYMENT_KINDS.map((k) => <option key={k} value={k}>{PAYMENT_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Method" id="pay-method" error={fieldError(result, "method")}>
          <select id="pay-method" value={v.method} onChange={set("method")} className={selectClass}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </select>
        </Field>
        {needsRef ? (
          <Field label={refLabel} id="pay-ref" error={fieldError(result, "reference")}>
            <Input id="pay-ref" value={v.reference} onChange={set("reference")} maxLength={60} autoCapitalize="characters" />
          </Field>
        ) : null}
        <Field label="Payer phone (optional)" id="pay-phone" error={fieldError(result, "payerPhone")}>
          <Input id="pay-phone" inputMode="tel" value={v.payerPhone} onChange={set("payerPhone")} />
        </Field>
        <Field label="Payer name (optional)" id="pay-name">
          <Input id="pay-name" value={v.payerName} onChange={set("payerName")} maxLength={100} />
        </Field>
        <Field label="Date & time (optional)" id="pay-date" error={fieldError(result, "paidAt")}>
          <Input id="pay-date" type="datetime-local" value={v.paidAt} onChange={set("paidAt")} />
        </Field>
      </div>
      {v.method === "mpesa" || v.method === "airtel_money" ? (
        <p className="text-xs text-muted-foreground">Receipt codes typed in by hand are marked “manual” (unverified). Use an M-Pesa prompt below for payments Safaricom confirms for you.</p>
      ) : null}
      <Field label="Notes (optional)" id="pay-notes">
        <Input id="pay-notes" value={v.notes} onChange={set("notes")} maxLength={500} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
        <Notice result={result} />
      </div>
    </form>
  );
}

/** Send an M-Pesa STK push to the customer's phone. Amounts above what's still to collect are refused server-side. */
export function MpesaStkForm({ dealId, defaultPhone, defaultAmount }: { dealId: string; defaultPhone: string | null; defaultAmount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PaymentActionResult<unknown> | null>(null);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : "");
  const [kind, setKind] = useState("installment");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await requestMpesaStkAction({ dealId, phone, amount, kind });
      setResult(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Customer's M-Pesa number" id="stk-phone" error={fieldError(result, "phone")}>
          <Input id="stk-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
        <Field label="Amount (KSh)" id="stk-amount" error={fieldError(result, "amount")}>
          <Input id="stk-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Payment type" id="stk-kind">
          <select id="stk-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            {PAYMENT_KINDS.filter((k) => k !== "refund").map((k) => <option key={k} value={k}>{PAYMENT_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send M-Pesa prompt"}</Button>
        <Notice result={result} />
      </div>
    </form>
  );
}

/** Per-row actions: check an STK prompt, clear/bounce a cheque, add a missing receipt, reverse (owner only). */
export function PaymentRowActions({ payment, dealId, canReverse }: { payment: Payment; dealId: string | null; canReverse: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PaymentActionResult<unknown> | null>(null);
  const [open, setOpen] = useState<null | "reverse" | "reference">(null);
  const [text, setText] = useState("");

  const run = (fn: () => Promise<PaymentActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setOpen(null);
        setText("");
        router.refresh();
      }
    });

  const isStk = payment.status === "pending" && payment.checkoutRequestId;
  const isCheque = payment.status === "pending" && payment.method === "cheque" && !payment.checkoutRequestId;
  const canAddReceipt = payment.status === "confirmed" && payment.method === "mpesa" && !payment.reference;
  const canReversePayment = canReverse && payment.status === "confirmed";
  if (!isStk && !isCheque && !canAddReceipt && !canReversePayment) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {isStk ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => refreshStkAction(payment.id, dealId))}>Check status</Button> : null}
        {isCheque ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => settlePendingAction(payment.id, "confirmed", dealId))}>Cheque cleared</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => settlePendingAction(payment.id, "failed", dealId))}>Cheque bounced</Button>
          </>
        ) : null}
        {canAddReceipt ? <Button size="sm" variant="outline" onClick={() => setOpen(open === "reference" ? null : "reference")}>Add receipt code</Button> : null}
        {canReversePayment ? <Button size="sm" variant="outline" onClick={() => setOpen(open === "reverse" ? null : "reverse")}>Reverse</Button> : null}
      </div>
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={open === "reverse" ? 300 : 12} placeholder={open === "reverse" ? "Why is this being reversed?" : "10-character receipt code"} className="h-9 max-w-xs" />
          <Button size="sm" disabled={pending || text.trim() === ""} onClick={() => run(() => (open === "reverse" ? reversePaymentAction(payment.id, text, dealId) : attachReferenceAction(payment.id, text, dealId)))}>
            {open === "reverse" ? "Confirm reversal" : "Save code"}
          </Button>
        </div>
      ) : null}
      <Notice result={result} />
    </div>
  );
}
