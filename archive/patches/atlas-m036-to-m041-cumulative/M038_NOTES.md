# Mission 038: Free tier at minimum production cost (plan-based AI quotas)

## Findings
- A free tier already existed: **Starter** (KES 0, 30 items, no capabilities) plus a 14-day Pro trial that falls back to Starter.
- **Leak found:** the customer-facing Atlas Assistant (WhatsApp + demo) was *not* entitlement-gated. A Starter business could run AI replies for free. Only the public web chat was gated (via the storefront capability).
- AI caps from M037 were global/env-wide, not per plan; trials had the same AI allowance as paying Pro.

## Changes
- New capability **`assistant`** (Growth, Pro). Starter has none, so the free plan costs ~nothing to serve.
- New limit key **`assistant_messages_daily`**: Growth 150, Pro 500 (UTC day).
- **`TRIAL_LIMITS`**: while `trialing`, assistant 60/day and Everest 100/month (lowers, never raises, a plan limit). `effectiveLimitFor(plan, status, key)` is used by `evaluateLimit` and `EntitlementService.resolveLimitGate`, so Everest picks up the trial cap automatically.
- `AssistantService.getAllowance()` = plan gate + daily cap (min of plan allowance and the `AI_DAILY_CAP_PER_BUSINESS` operator ceiling). Used by `getAvailability`, `handleCustomerMessage` (reason `not_in_plan` / `limit_reached`) and `getUsageToday`.
- Owner sees "Today: X of Y customer messages used" on the Assistant page.
- At the cap: web chat returns a clear 503 message pointing to the enquiry form; WhatsApp sends one "the team will reply personally" notice per customer per hour instead of silence.
- `scripts/ai-usage.mjs` for the operator; ships in the Docker image.

## Behaviour change to be aware of
Starter businesses lose the WhatsApp/demo assistant (it was never meant to be free). Growth+ and trials keep it.

## Not done / follow-ups
- Marketing AI blurbs are only globally capped (Pro-only capability, small cheap calls).
- Daily counters are per UTC day (Nairobi midnight is 03:00 UTC).
- Tests added for the new rules were written but not run in this pass.
