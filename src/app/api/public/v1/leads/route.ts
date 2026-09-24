import { NextResponse } from "next/server";

import { DatabaseBusinessRepository } from "@/features/auth/repository/database-business-repository";
import { getConversionService } from "@/features/conversion/service";
import type { PublicLeadInput } from "@/features/conversion/domain/lead-intake";

/**
 * Mission 027 (correction) — the external-integration API's write
 * side: a dealer's own website posts a lead capture form's contents
 * here directly, so their own site's UI/branding never has to change
 * — Atlas just becomes the CRM behind it. Same API-key auth and CORS
 * posture as the inventory GET route (see that file's doc comment).
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const apiKey = bearerToken(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key." }, { status: 401, headers: CORS_HEADERS });
  }

  const businessRepository = new DatabaseBusinessRepository();
  const business = await businessRepository.getByPublicApiKey(apiKey);
  if (!business) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401, headers: CORS_HEADERS });
  }

  let body: PublicLeadInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS_HEADERS });
  }

  const conversionService = getConversionService();
  const channelResult = await conversionService.resolveChannel(business.id, "external_integration");
  if (!channelResult.ok) {
    return NextResponse.json({ error: channelResult.error.message }, { status: 403, headers: CORS_HEADERS });
  }

  const leadResult = await conversionService.submitPublicLead(channelResult.data, "external_integration", body);
  if (!leadResult.ok) {
    return NextResponse.json(
      { error: leadResult.error.message, fieldErrors: leadResult.error.fieldErrors },
      { status: 422, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json({ leadId: leadResult.data.leadId }, { status: 201, headers: CORS_HEADERS });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}
