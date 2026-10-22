import { NextResponse } from "next/server";

import { getConversionService } from "@/features/conversion/service";
import { authenticatePublicApi, preflightResponse } from "@/features/conversion/lib/public-api-auth";

/**
 * Mission 027 (correction) — the external-integration API's read side: a
 * business with its *own* website pulls current inventory from here instead
 * of sending customers to the Atlas-hosted storefront. Authenticated by the
 * business's public API key (Authorization: Bearer <key>), not a session.
 *
 * Mission 037 — auth, rate limiting and the per-business browser-origin
 * allowlist live in features/conversion/lib/public-api-auth.ts. The key
 * only ever grants read-inventory/write-lead for one business.
 */
const METHODS = "GET, OPTIONS";

export async function OPTIONS() {
  return preflightResponse(METHODS);
}

export async function GET(request: Request) {
  const auth = await authenticatePublicApi(request, METHODS, { perIpPerMinute: 120, perKeyPerMinute: 60 }, "inventory");
  if (!auth.ok) return auth.response;

  const conversionService = getConversionService();
  const channelResult = await conversionService.resolveChannel(auth.business.id, "external_integration");
  if (!channelResult.ok) {
    return NextResponse.json({ error: channelResult.error.message }, { status: 403, headers: auth.cors });
  }

  const { items } = await conversionService.getPublicCatalog(channelResult.data);
  return NextResponse.json({ items }, { headers: auth.cors });
}
