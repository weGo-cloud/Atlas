import { splitForMeta } from "./split";
import { graphApiJsonPost } from "@/features/marketing/channels/meta-graph-client";
import { DatabaseMarketingChannelRepository } from "@/features/marketing/repository/database-marketing-channel-repository";

export interface MetaSender {
  /** Sends `text` to `recipientId` (PSID/IGSID) as the business's Page. Long text is split into a few messages. */
  sendText(businessId: string, pageId: string, recipientId: string, text: string): Promise<void>;
}

/**
 * The business's own Page token (stored encrypted, Mission 037), and only if it is the token for THIS Page.
 * No deployment-wide fallback token: one business's token must never be used to speak for another's Page.
 */
async function resolvePageToken(businessId: string, pageId: string): Promise<string | null> {
  const connection = await new DatabaseMarketingChannelRepository(businessId).getConnectionWithToken("meta");
  if (connection?.status === "connected" && connection.accessToken && connection.externalAccountLabel === pageId) return connection.accessToken;
  return null;
}

/**
 * Official Messenger Platform Send API only (also used for Instagram DMs linked to the Page). Replies are only
 * ever sent in response to an inbound customer message (`messaging_type: RESPONSE`, inside Meta's 24-hour
 * window); Atlas Assistant never initiates a conversation.
 */
export class GraphMetaSender implements MetaSender {
  async sendText(businessId: string, pageId: string, recipientId: string, text: string): Promise<void> {
    const token = await resolvePageToken(businessId, pageId);
    if (!token) throw new Error("Messenger/Instagram is not connected for this business.");
    for (const part of splitForMeta(text)) {
      await graphApiJsonPost(`${pageId}/messages`, token, { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text: part } });
    }
  }
}

export { META_MESSAGE_CHUNK, splitForMeta } from "./split";
