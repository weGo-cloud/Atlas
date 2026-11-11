# Deploying Atlas (one VPS, Docker, SQLite): Mission 037

## 1. Server
Ubuntu 24.04 VPS, 2 GB RAM. DNS A record -> server IP.
`curl -fsSL https://get.docker.com | sh` then `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`

## 2. Configure
```bash
git clone <repo> /opt/atlas && cd /opt/atlas
cp .env.example .env && chmod 600 .env
```
Set in `.env` (the server refuses to start without these four):
- `ALLOWED_ORIGINS=atlas.yourdomain.com` (no scheme)
- `PUBLIC_BASE_URL=https://atlas.yourdomain.com`
- `ATLAS_ENCRYPTION_KEY=$(openssl rand -base64 32)` (back this up separately)
- `ANTHROPIC_API_KEY=...` (use a dedicated key with a monthly spend limit)
Also edit the domain in `Caddyfile`.

## 3. Launch
`docker compose up -d --build` then `docker compose logs -f app` (expect `[migrate] ok`).
Health: `curl https://atlas.yourdomain.com/api/health`

## 4. First owner (no signup flow; never run the dev seeds)
```bash
docker compose exec app node create-owner.mjs \
  --email you@shop.co.ke --name "Your Name" --business "Shop Name" \
  --vertical furniture --plan pro
```
Prints a temporary password once.

## 5. Updates / backups
Update: `git pull && docker compose up -d --build` (migrations run on start).
Backup: `crontab -e` -> `0 2 * * * /opt/atlas/scripts/backup.sh`

## 6. Rules
- Single instance only (SQLite + in-memory rate limiter).
- Behind Cloudflare later? Configure Caddy `trusted_proxies`, or client IPs (login/API limits) will be wrong.
- Public API keys are now hashed: owners see a key once at generation. Existing keys keep working and are upgraded automatically.
- AI allowances are plan-based (Starter none, trial 60/day, Growth 150/day, Pro 500/day; tune in `entitlements/domain/plan.ts`). `AI_DAILY_CAP_GLOBAL` is the account-wide fuse; `AI_DAILY_CAP_PER_BUSINESS` is an operator ceiling. See usage: `docker compose exec app node ai-usage.mjs`. CSP rollout: `CSP_MODE=report-only`.

## 7. Messenger & Instagram DMs (Mission 039)
1. Meta app (Business type): add the Messenger product (and Instagram messaging if you want IG DMs).
2. Webhooks: callback `https://<domain>/api/meta/webhook`, verify token = `META_WEBHOOK_VERIFY_TOKEN`; subscribe the Page and Instagram objects to the `messages` field. `META_APP_SECRET` must be set (the webhook returns 503 without it).
3. Permissions (names as I know them; confirm on Meta's current docs): `pages_messaging`, `pages_show_list`, `pages_manage_metadata`, and for Instagram `instagram_basic` + `instagram_manage_messages`.
4. Access level: **Standard Access** works only for people with a role on your app, so for the first pilots add the client as an app tester/admin and generate their long-lived **Page access token**. Serving arbitrary client Pages needs **Advanced Access** = Business Verification + App Review (start verification early, it runs in parallel).
5. In Atlas: owner opens Assistant > Settings > Messenger & Instagram and pastes Page ID, optional Instagram account ID, and the Page token. Atlas verifies the token with Meta before saving; the token is stored encrypted.
6. Set `META_GRAPH_API_VERSION` to a currently supported version.
Behaviour: replies only to customers who message first (inside Meta's 24h window), text only (no product photos yet), same plan gate and daily allowance as WhatsApp (Growth/Pro/trial; never Starter).

## 8. Customer payments (M-Pesa prompts) and plan billing (Missions 040/041)
**Customer payments.** Any plan can record payments by hand (cash, M-Pesa receipt code, bank, cheque, card, financing, trade-in). Growth/Pro owners can also connect their OWN Daraja account in Settings and send M-Pesa prompts from a deal; money goes straight to their till/paybill. Safaricom calls back `https://<domain>/api/payments/mpesa/callback/<businessId>/<token>` (sent with each prompt automatically, nothing to register). Needs `PUBLIC_BASE_URL` (https) and `ATLAS_ENCRYPTION_KEY`.

**Plan billing (Atlas's own revenue).** Set the seven `MPESA_PLATFORM_*` / `BILLING_*` variables together (see `.env.example`). Then owners get a "Pay for your plan" card, and plans activate only after Safaricom confirms payment. Add the scheduler (hourly is right; it's idempotent):
```
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $BILLING_CRON_SECRET" https://<domain>/api/billing/cron
```
What the cycle does: 3 days before a paid plan renews it creates the invoice and sends an M-Pesa prompt, then re-prompts on the due date, +2 and +5 days; after the due date the subscription shows past-due (access continues); 7 days past due with no payment the invoice closes and the business drops to the free Starter plan (no data deleted). Honest limit: M-Pesa prompts need the customer's PIN each time, so this is "automatic reminders + one-tap payment", not a silent card-on-file charge. A standing-order rail (Safaricom's Ratiba) or card tokenization could later replace the prompt without changing the invoice rules.

**Go-live checklist for money:** test the whole flow in sandbox first (`MPESA_PLATFORM_ENV=sandbox`); confirm callbacks reach your domain over https; back up `ATLAS_ENCRYPTION_KEY` separately (losing it makes stored credentials unrecoverable); keep `PAYMENTS_ENABLED` / `BILLING_ENABLED` handy as kill switches; reconcile `GET /app/payments` and the invoice list against your Safaricom statement weekly; the append-only `payment_events` table is your audit trail.
