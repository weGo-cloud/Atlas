# M040 payments + M041 automated plan billing

## M040: customer payments ledger (any plan) + M-Pesa prompts (Growth/Pro)
- Methods: cash, M-Pesa (prompt / receipt code / pasted SMS), Airtel Money, bank transfer, cheque (pending until cleared), card, financing/hire purchase, trade-in credit, other. Kinds: deposit, instalment, balance, full payment, refund.
- Balance per deal (confirmed only; pending reserves room; refunds subtract). Payments page: month totals by method, latest payments, "mobile money entered by hand" total.
- Furniture shops: payments work against a customer and optionally a deal. Deals are vehicle-centric today, so a furniture order/balance model is the natural next mission.

## Security / robustness (what an attacker or a mistake runs into)
- Ledger tamper-resistance in the DATABASE (migration 0023 triggers): no deletes, amount/method/customer/dates immutable, failed/cancelled/reversed are terminal, verification flag locked, audit events append-only. Reversal needs the owner-only `payment.reverse` permission and a reason.
- No overpayment even under races: deal check + balance check + insert in ONE immediate transaction; pending prompts reserve room.
- Duplicate protection: unique (business, method, reference); one receipt can never be recorded twice; STK checkout ids unique.
- M-Pesa authenticity (callbacks are unsigned by Safaricom): per-business 192-bit URL token (constant-time compare, rotated when credentials change) + independent STK query before money counts + amount match + compare-and-set (replays/races are no-ops) + body-size/IP/business rate limits + uniform "Accepted" reply.
- Evidence honesty: manual M-Pesa/Airtel entries are flagged "manual (unverified)" forever; only Safaricom confirmation makes a payment "verified".
- Abuse limits: per-phone (3/h), per-user, per-business prompt limits, an hourly KES volume cap, a per-prompt cap (250k default), 2-minute duplicate-prompt guard; kill switch `PAYMENTS_ENABLED=false`.
- Credentials: AES-256-GCM encrypted, write-only in the UI, verified with Safaricom before save, owner-only AND password re-entry (step-up, rate-limited) to connect/disconnect, so a hijacked session can't quietly redirect customer money.
- Tenant isolation: every repository query carries the business id; the customer on a prompt comes from the deal, never from the request.
- Inputs: whole-shilling amounts only, method-specific reference rules, Kenyan phone normalization, date sanity, size caps.

## M041: automated plan billing (Atlas's own revenue)
- Owner pays for Growth/Pro by M-Pesa; price/plan come from the server catalog; plan activates only after Safaricom confirms (callback token + STK query + amount match), settled in one transaction with the subscription change (period dates, status active, trial consumed).
- Automated cycle (`POST /api/billing/cron`, hourly, secret-guarded, idempotent): renewal invoice 3 days ahead; prompts at -3d / due / +2d / +5d; past_due after due date (access continues); after 7 days unpaid the invoice closes and the business falls back to free Starter (data untouched). Unpaid upgrade attempts void after 24h.
- DB invariants (migration 0024): one open invoice per business; one checkout id and one receipt per invoice; invoice amount/plan/period immutable; terminal statuses final; no deletes.
- `SELF_SERVE_PAID_UPGRADES` stays false on purpose: the old change-plan button would still switch plans without payment. Paid upgrades go ONLY through the new payment card.
- Honest limit: M-Pesa needs the PIN on every prompt, so this is automatic reminders + one-tap payment, not silent auto-debit. Safaricom's Ratiba standing-order API exists for true recurring collection; it needs product enablement and sandbox verification, so it is the recommended next adapter, not shipped here.
- All-or-nothing config: any `MPESA_PLATFORM_*`/`BILLING_*` variable present requires all seven or the server won't start.

## Not done / limits
- No chargeback/reversal webhooks from M-Pesa (reverse manually); no proration on mid-period plan change (an upgrade starts a fresh month); no email/SMS reminders (in-app card + the prompts themselves); no C2B paybill auto-matching of customer payments (next).
- Verified: typecheck and lint clean; full suite 134 files / 1350 tests passing (including 56 new payments+billing tests, DB-trigger tamper tests, forged/replayed callback tests, the clock-driven renewal-to-downgrade walk-through and step-up password tests); production `next build` succeeds; live smoke test of health, cron (404 when unconfigured), both callbacks (uniform accept, 400/413/404 hygiene) and the auth gate. NOT verified: any call to the real Safaricom sandbox/production (no network/credentials here): run the sandbox end-to-end before real money.
