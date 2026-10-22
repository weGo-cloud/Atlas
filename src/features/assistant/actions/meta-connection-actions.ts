"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { getEntitlementService } from "@/features/entitlements/service";
import { DatabaseMarketingChannelRepository } from "@/features/marketing/repository/database-marketing-channel-repository";
import { isEncryptionConfigured } from "@/lib/security/secret-box";
import { verifyMetaConnection } from "../channels/meta/verify";
import { getAssistantService } from "../service/assistant-service";

const SETTINGS_PATH = "/app/assistant/settings";

function fail(message: string): never {
  redirect(`${SETTINGS_PATH}?meta_error=${encodeURIComponent(message.slice(0, 240))}`);
}

function digits(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{5,30}$/.test(trimmed) ? trimmed : null;
}

/**
 * Mission 039 — connects a business's Facebook Page (Messenger) and optional Instagram account to the Atlas
 * Assistant. Owner-only (it stores a credential), plan-gated like the assistant itself, and the Page access token
 * is VERIFIED against Meta before anything is saved or routed. The token is stored encrypted and never shown again.
 */
export async function connectMetaPageAction(formData: FormData): Promise<void> {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) fail("Only the business owner can connect Messenger and Instagram.");
    throw error;
  }
  const businessId = session.business.id;

  const entitled = await getEntitlementService().canAccess(businessId, "assistant");
  if (!entitled.allowed) fail("Messenger and Instagram chat need the Growth or Pro plan.");
  if (!isEncryptionConfigured()) fail("The server has no ATLAS_ENCRYPTION_KEY configured, so credentials can't be stored safely yet.");

  const pageId = digits(formData, "pageId");
  if (!pageId) fail("Enter the numeric Facebook Page ID (digits only).");
  const instagramRaw = formData.get("instagramAccountId");
  const instagramAccountId = typeof instagramRaw === "string" && instagramRaw.trim() !== "" ? digits(formData, "instagramAccountId") : null;
  if (typeof instagramRaw === "string" && instagramRaw.trim() !== "" && !instagramAccountId) fail("The Instagram account ID must be digits only.");
  const tokenRaw = formData.get("accessToken");
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  if (token.length < 20 || token.length > 1000) fail("Paste the Page access token from Meta.");

  const verification = await verifyMetaConnection(token, pageId!, instagramAccountId);
  if (!verification.ok) fail(verification.message);

  const service = getAssistantService(businessId, { llm: null });
  const previous = await service.repo.getSettings();
  try {
    await service.repo.saveSettings({ metaPageId: pageId, instagramAccountId });
  } catch {
    fail("This Page or Instagram account is already connected to another business.");
  }
  try {
    await new DatabaseMarketingChannelRepository(businessId).upsertConnection({
      channel: "meta",
      status: "connected",
      externalAccountLabel: pageId,
      accessToken: token,
    });
  } catch {
    await service.repo.saveSettings({ metaPageId: previous.metaPageId, instagramAccountId: previous.instagramAccountId });
    fail("Could not store the access token. Please try again.");
  }

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?meta=connected`);
}

/** Mission 039 — disconnects: stops routing DMs to this business and wipes the stored token. */
export async function disconnectMetaPageAction(): Promise<void> {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) fail("Only the business owner can disconnect Messenger and Instagram.");
    throw error;
  }
  const businessId = session.business.id;
  await getAssistantService(businessId, { llm: null }).repo.saveSettings({ metaPageId: null, instagramAccountId: null });
  await new DatabaseMarketingChannelRepository(businessId).upsertConnection({
    channel: "meta",
    status: "not_connected",
    externalAccountLabel: null,
    accessToken: null,
  });
  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?meta=disconnected`);
}
