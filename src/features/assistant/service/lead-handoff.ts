import { getCustomerService } from "@/features/customers/service";
import { getLeadService } from "@/features/leads/service";
import type { LeadHandoff, LeadHandoffInput } from "../domain/ports";
import type { ConversationChannel } from "../domain/types";

const LEAD_SOURCE: Record<ConversationChannel, string> = {
  website_chat: "website_chat",
  whatsapp: "whatsapp",
  simulated: "assistant_demo",
};

const MAX_NOTES = 4000;

/**
 * Mission 033, Section 8 — hands a conversation to the team by creating
 * a real Atlas Customer + Lead through the same CustomerService and
 * LeadService every other path uses (ConversionService.submitPublicLead
 * calls exactly these). A conversation only ever produces one lead:
 * a second handoff appends to that lead's notes instead.
 */
export class ServiceLeadHandoff implements LeadHandoff {
  constructor(private readonly businessId: string) {}

  async createOrUpdate(input: LeadHandoffInput): Promise<{ leadId: string; created: boolean } | { error: string }> {
    const leadService = getLeadService(this.businessId);

    if (input.conversation.leadId) {
      const existing = await leadService.getLead(input.conversation.leadId);
      if (existing.ok) {
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
        const notes = `${existing.data.notes ?? ""}\n\n--- Update ${stamp} ---\n${input.summary}`.trim().slice(-MAX_NOTES);
        const updated = await leadService.updateLead(existing.data.id, { notes });
        if (updated.ok) return { leadId: existing.data.id, created: false };
        return { error: updated.error.message };
      }
      // The lead was deleted since — fall through and create a fresh one.
    }

    const customerResult = await getCustomerService(this.businessId).createCustomer({
      name: input.name,
      phone: input.phone,
      notes: `Started via ${input.conversation.channel === "whatsapp" ? "WhatsApp" : "website chat"} with Atlas Assistant.`,
    });
    if (!customerResult.ok) {
      return { error: customerResult.error.fieldErrors?.phone ?? customerResult.error.message };
    }

    const firstItemId = input.itemIds[0] ?? null;
    let leadResult = await leadService.createLead({
      customerId: customerResult.data.id,
      furnitureProductId: firstItemId,
      source: LEAD_SOURCE[input.conversation.channel],
      notes: input.summary.slice(0, MAX_NOTES),
    });
    if (!leadResult.ok && firstItemId) {
      // The piece may have been removed since it was shown; the enquiry is still real interest.
      leadResult = await leadService.createLead({
        customerId: customerResult.data.id,
        source: LEAD_SOURCE[input.conversation.channel],
        notes: input.summary.slice(0, MAX_NOTES),
      });
    }
    if (!leadResult.ok) return { error: leadResult.error.message };
    return { leadId: leadResult.data.id, created: true };
  }
}
