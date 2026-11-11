"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectMpesaAccountAction, disconnectMpesaAccountAction, type PaymentActionResult } from "../actions/payment-actions";

type Props = {
  account: { environment: string; shortcode: string; tillNumber: string | null; transactionType: string } | null;
  canManage: boolean;
  entitled: boolean;
};

/** Mission 040 — owner-only M-Pesa (Daraja) connection. Secrets are write-only: they are never sent back to the browser. */
export function MpesaAccountCard({ account, canManage, entitled }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PaymentActionResult | null>(null);
  const [v, setV] = useState({ environment: "sandbox", transactionType: "paybill", shortcode: "", tillNumber: "", consumerKey: "", consumerSecret: "", passkey: "", currentPassword: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const fieldError = (name: string) => (result && !result.ok ? (result.error.fieldErrors as Record<string, string> | undefined)?.[name] : undefined);

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await connectMpesaAccountAction(v);
      setResult(r);
      if (r.ok) {
        setV((s) => ({ ...s, consumerKey: "", consumerSecret: "", passkey: "", currentPassword: "" }));
        router.refresh();
      }
    });
  };
  const disconnect = () =>
    start(async () => {
      const r = await disconnectMpesaAccountAction(v.currentPassword);
      setResult(r);
      if (r.ok) {
        setV((s) => ({ ...s, currentPassword: "" }));
        router.refresh();
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">M-Pesa payments</CardTitle>
        <CardDescription>
          Send customers an M-Pesa prompt straight from a deal. Money goes to YOUR till or paybill, never through Atlas. You can always record M-Pesa payments by receipt code without connecting. Prompts need the Growth or Pro plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canManage ? <p className="text-sm text-muted-foreground">Only the business owner can change payment settings.</p> : null}
        {!entitled ? <p className="text-sm text-muted-foreground">M-Pesa prompts aren&apos;t included in your current plan.</p> : null}

        {account ? (
          <p className="text-sm">
            Connected — {account.transactionType === "till" ? "Till" : "Paybill"} <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{account.shortcode}</code> ({account.environment}). Credentials are stored encrypted and can&apos;t be viewed again.
          </p>
        ) : null}

        {canManage && entitled ? (
          <form onSubmit={connect} className="flex flex-col gap-3">
            <p className="text-sm font-medium">{account ? "Replace the connection" : "Connect your M-Pesa account"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-env">Environment</Label>
                <select id="mp-env" value={v.environment} onChange={set("environment")} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="sandbox">Sandbox (testing)</option>
                  <option value="production">Production (real money)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-type">Collect via</Label>
                <select id="mp-type" value={v.transactionType} onChange={set("transactionType")} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="paybill">Paybill</option>
                  <option value="till">Buy Goods (till)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-code">Shortcode</Label>
                <Input id="mp-code" inputMode="numeric" value={v.shortcode} onChange={set("shortcode")} required />
                {fieldError("shortcode") ? <p className="text-xs text-destructive">{fieldError("shortcode")}</p> : null}
              </div>
              {v.transactionType === "till" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mp-till">Till number (if different from shortcode)</Label>
                  <Input id="mp-till" inputMode="numeric" value={v.tillNumber} onChange={set("tillNumber")} />
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-key">Consumer key</Label>
                <Input id="mp-key" type="password" autoComplete="off" value={v.consumerKey} onChange={set("consumerKey")} required />
                {fieldError("consumerKey") ? <p className="text-xs text-destructive">{fieldError("consumerKey")}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-secret">Consumer secret</Label>
                <Input id="mp-secret" type="password" autoComplete="off" value={v.consumerSecret} onChange={set("consumerSecret")} required />
                {fieldError("consumerSecret") ? <p className="text-xs text-destructive">{fieldError("consumerSecret")}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="mp-pass">Lipa Na M-Pesa passkey</Label>
                <Input id="mp-pass" type="password" autoComplete="off" value={v.passkey} onChange={set("passkey")} required />
                {fieldError("passkey") ? <p className="text-xs text-destructive">{fieldError("passkey")}</p> : null}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 max-w-xs">
              <Label htmlFor="mp-pw">Your sign-in password</Label>
              <Input id="mp-pw" type="password" autoComplete="current-password" value={v.currentPassword} onChange={set("currentPassword")} required />
              <p className="text-xs text-muted-foreground">Re-entered to protect where your customers&apos; money goes. Atlas verifies the credentials with Safaricom before saving.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>{pending ? "Verifying…" : "Verify and connect"}</Button>
              {account ? <Button type="button" variant="outline" disabled={pending || v.currentPassword === ""} onClick={disconnect}>Disconnect</Button> : null}
            </div>
          </form>
        ) : null}

        {result ? (result.ok ? <p role="status" className="text-sm text-success">{result.message}</p> : <p role="alert" className="text-sm text-destructive">{result.error.message}</p>) : null}
      </CardContent>
    </Card>
  );
}
