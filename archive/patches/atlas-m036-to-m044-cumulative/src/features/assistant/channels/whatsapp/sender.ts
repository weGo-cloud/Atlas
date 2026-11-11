import { DatabaseMarketingChannelRepository } from "@/features/marketing/repository/database-marketing-channel-repository";
import { graphApiJsonPost } from "@/features/marketing/channels/meta-graph-client";

export interface WhatsAppSender {
  markRead(businessId: string, phoneNumberId: string, messageId: string): Promise<void>;
  sendText(businessId: string, phoneNumberId: string, to: string, body: string): Promise<void>;
  sendImage(businessId: string, phoneNumberId: string, to: string, link: string, caption: string): Promise<void>;
}

async function resolveToken(businessId: string): Promise<string | null> {
  const connection = await new DatabaseMarketingChannelRepository(businessId).getConnectionWithToken("whatsapp");
  if (connection?.status === "connected" && connection.accessToken) return connection.accessToken;
  // Single-tenant convenience: one system-user token for the whole deployment.
  return process.env.WHATSAPP_ACCESS_TOKEN || null;
}

/**
 * Official WhatsApp Business Cloud API only, via the shared Graph
 * client. Replies are sent only in response to an inbound customer
 * message (inside the 24-hour customer-service window) — Atlas
 * Assistant never initiates a conversation.
 */
export class CloudApiWhatsAppSender implements WhatsAppSender {
  private async post(businessId: string, phoneNumberId: string, payload: Record<string, unknown>) {
    const token = await resolveToken(businessId);
    if (!token) throw new Error("WhatsApp is not connected for this business.");
    await graphApiJsonPost(`${phoneNumberId}/messages`, token, { messaging_product: "whatsapp", ...payload });
  }

  async markRead(businessId: string, phoneNumberId: string, messageId: string) {
    await this.post(businessId, phoneNumberId, { status: "read", message_id: messageId });
  }

  async sendText(businessId: string, phoneNumberId: string, to: string, body: string) {
    await this.post(businessId, phoneNumberId, { to, type: "text", text: { body, preview_url: false } });
  }

  async sendImage(businessId: string, phoneNumberId: string, to: string, link: string, caption: string) {
    await this.post(businessId, phoneNumberId, { to, type: "image", image: { link, caption: caption.slice(0, 1000) } });
  }
}
