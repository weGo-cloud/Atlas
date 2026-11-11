# Mission 039: Messenger + Instagram DM channel for the Atlas Assistant

## What it is
A third customer channel (after website chat and WhatsApp) using the SAME engine, entitlement gate, daily plan allowance (M038), spend guard (M037) and lead handoff. Not a new AI; a new adapter.

## Pieces
- `channels/meta/payload.ts`: parses Messenger (`object: page`) and Instagram (`object: instagram`) webhooks; drops echoes, reads, deliveries, postbacks.
- `channels/meta/handler.ts`: route by account, availability/plan check, per-customer burst limit (10/min), one-per-hour replies for non-text and for the daily-limit notice, "stop" opt-out, idempotent on message id.
- `channels/meta/sender.ts`: Send API (`/{pageId}/messages`, `messaging_type: RESPONSE`), long replies split into at most 3 messages. Uses ONLY the business's own encrypted Page token (no shared fallback token).
- `channels/meta/verify.ts`: proves the token belongs to the claimed Page (`/me`) and the Instagram account is linked to it, **before** routing. Prevents a business claiming another business's public Page id to read its customers' messages.
- `api/meta/webhook`: GET handshake, POST with raw-body HMAC (`META_APP_SECRET`), 200 fast then process via `after()`.
- `assistant_settings`: `meta_page_id`, `instagram_account_id` (unique; migration 0022). Cross-business lookup `findMetaRoute`.
- Owner-only, plan-gated connect/disconnect actions + "Messenger & Instagram" card in Assistant settings. Token is write-only.
- New conversation channels `messenger`, `instagram` (filters, labels and lead source/notes follow automatically). Instagram/Messenger customers have no phone number, so the assistant asks for one before creating an enquiry (same as web chat).

## Not done / next
- Text only: no product photo cards or quick replies yet (Messenger supports image attachments).
- Facebook-Login path only (Page token). Instagram API with Instagram Login (separate token/endpoint) is not implemented.
- Comments, story replies and Facebook post comments are not handled (DMs only).
- Meta Advanced Access (Business Verification + App Review) is required to serve client Pages that don't have a role on your app. See DEPLOY.md section 7.
- Tests written but not run in this pass. `META_GRAPH_API_VERSION` defaults to the repo's old v19.0; set a current one.
