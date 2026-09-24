"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { getMarketingContentService, getPublishService, getChannelProviders } from "../service";
import type { MarketableItemRef } from "../domain/marketing-item-ref";
import type { MarketingContent } from "../domain/marketing-content";
import type { MarketingChannel, MarketingPublication } from "../domain/marketing-channel";
import type { MarketingServiceError } from "../domain/errors";
import { getCustomerService } from "@/features/customers/service";
import { getLeadService } from "@/features/leads/service";
import type { Lead } from "@/features/leads/domain/lead";

export type MarketingContentActionResult =
  | { ok: true; content: MarketingContent }
  | { ok: false; error: MarketingServiceError };

export type PublicationActionResult =
  | { ok: true; publication: MarketingPublication }
  | { ok: false; error: MarketingServiceError };

function revalidateItemPaths(itemRef: MarketableItemRef) {
  // Mission 030 — /app/inventory/[id] is the same route for both
  // verticals (it branches server-side on business.vertical), so
  // there's no vertical-specific path to build here.
  revalidatePath("/app/inventory");
  revalidatePath(`/app/inventory/${itemRef.itemId}`);
  revalidatePath("/app/leads");
}

export async function generateMarketingContentAction(itemRef: MarketableItemRef): Promise<MarketingContentActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getMarketingContentService(business.id).generateContent(itemRef);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateItemPaths(itemRef);
  return { ok: true, content: result.data };
}

export async function updateMarketingContentAction(
  itemRef: MarketableItemRef,
  contentId: string,
  input: { socialCaption?: string; whatsappMessage?: string }
): Promise<MarketingContentActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getMarketingContentService(business.id).updateContent(contentId, input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateItemPaths(itemRef);
  return { ok: true, content: result.data };
}

/** The real publish path — see PublishService.publish's doc comment for why this is a separate action from simulatePublishAction, never a shared action with a flag. */
export async function publishContentAction(
  itemRef: MarketableItemRef,
  contentId: string,
  channel: MarketingChannel,
  options?: { recipientPhone?: string }
): Promise<PublicationActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getPublishService(business.id).publish(contentId, channel, options);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateItemPaths(itemRef);
  return { ok: true, publication: result.data };
}

/** Mission 031, Section 17 — the explicitly-labeled demo path (see PublishService.simulatePublish). */
export async function simulatePublishAction(
  itemRef: MarketableItemRef,
  contentId: string,
  channel: MarketingChannel
): Promise<PublicationActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getPublishService(business.id).simulatePublish(contentId, channel);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateItemPaths(itemRef);
  return { ok: true, publication: result.data };
}

export async function getChannelStatusAction(channel: MarketingChannel) {
  const { business } = await requireCurrentSession();
  return getChannelProviders()[channel].resolveStatus(business.id);
}

export type SimulateEnquiryActionResult = { ok: true; lead: Lead } | { ok: false; error: { message: string } };

/**
 * Mission 031, Section 19 — "if real social/WhatsApp APIs cannot
 * generate a real inbound customer response during development, do
 * not fake an external customer. Instead, provide a controlled demo
 * mechanism clearly marked as simulation." This is that mechanism: a
 * person (the dealer, running the demo) types in the simulated
 * customer's own details themselves — the system never invents a
 * customer or a message on its own. What this produces (a real
 * Customer + Lead row, via the exact same LeadService every other
 * channel uses) is completely real; only the "a customer on the
 * other end of this channel did this" part is operator-simulated,
 * and the lead's `source` records which channel was being simulated
 * so the attribution story (Section 10/11) is exercised honestly.
 */
export async function simulateChannelEnquiryAction(
  itemRef: MarketableItemRef,
  channel: MarketingChannel,
  input: { customerName: string; customerPhone: string; message?: string }
): Promise<SimulateEnquiryActionResult> {
  const { business } = await requireCurrentSession();

  if (!input.customerName.trim() || !input.customerPhone.trim()) {
    return { ok: false, error: { message: "A customer name and phone number are required." } };
  }

  const customerResult = await getCustomerService(business.id).createCustomer({
    name: input.customerName.trim(),
    phone: input.customerPhone.trim(),
    notes: input.message?.trim() ? `Demo-simulated ${channel} enquiry: ${input.message.trim()}` : undefined,
  });
  if (!customerResult.ok) {
    return { ok: false, error: { message: customerResult.error.message } };
  }

  const leadResult = await getLeadService(business.id).createLead({
    customerId: customerResult.data.id,
    vehicleId: itemRef.itemType === "vehicle" ? itemRef.itemId : undefined,
    furnitureProductId: itemRef.itemType === "furniture_product" ? itemRef.itemId : undefined,
    source: channel,
  });
  if (!leadResult.ok) {
    return { ok: false, error: { message: leadResult.error.message } };
  }

  revalidateItemPaths(itemRef);
  revalidatePath("/app/leads");
  return { ok: true, lead: leadResult.data };
}
