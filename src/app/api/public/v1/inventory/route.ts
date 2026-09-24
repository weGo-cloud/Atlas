import { NextResponse } from "next/server";

import { DatabaseBusinessRepository } from "@/features/auth/repository/database-business-repository";
import { getConversionService } from "@/features/conversion/service";

/**
 * Mission 027 (correction) — the external-integration API's read
 * side: a dealer with their *own* website calls this from their site
 * (a build-time fetch, a client widget, whatever fits their stack) to
 * pull current inventory, instead of sending customers to the
 * Atlas-hosted storefront. Authenticated by `businesses.publicApiKey`
 * (Authorization: Bearer <key>), not a session — there is no
 * browser session here, this is a server-to-server or public-browser
 * call from a *different* origin, hence the permissive CORS headers
 * below (safe: the key only ever grants read-inventory/write-lead for
 * one business, nothing more sensitive — see schema.ts's doc comment
 * on the column).
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const apiKey = bearerToken(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key." }, { status: 401, headers: CORS_HEADERS });
  }

  const businessRepository = new DatabaseBusinessRepository();
  const business = await businessRepository.getByPublicApiKey(apiKey);
  if (!business) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401, headers: CORS_HEADERS });
  }

  const conversionService = getConversionService();
  const channelResult = await conversionService.resolveChannel(business.id, "external_integration");
  if (!channelResult.ok) {
    return NextResponse.json({ error: channelResult.error.message }, { status: 403, headers: CORS_HEADERS });
  }

  const { items } = await conversionService.getPublicCatalog(channelResult.data);
  return NextResponse.json({ items }, { headers: CORS_HEADERS });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}
