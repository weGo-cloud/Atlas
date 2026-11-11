export type MetaPlatform = "messenger" | "instagram";

/** Mission 039 — one inbound customer DM from a Messenger or Instagram webhook. */
export type InboundMetaMessage = {
  platform: MetaPlatform;
  /** `entry.id`: the Facebook Page id (messenger) or Instagram professional account id (instagram) that received the message. */
  accountId: string;
  /** Page-scoped (PSID) or Instagram-scoped (IGSID) id of the customer. Stable per customer per account, NOT a phone number. */
  senderId: string;
  messageId: string;
  text: string | null;
  hasAttachment: boolean;
};

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

/**
 * Extracts inbound customer messages from a Messenger (`object: "page"`) or Instagram (`object: "instagram"`)
 * webhook body. Echoes of our own sends, reads, deliveries, postbacks and malformed entries yield nothing, so
 * the assistant can never answer itself or react to non-message events.
 */
export function parseMetaPayload(body: unknown): InboundMetaMessage[] {
  const root = asObject(body);
  if (!root || !Array.isArray(root.entry)) return [];
  const platform: MetaPlatform | null = root.object === "page" ? "messenger" : root.object === "instagram" ? "instagram" : null;
  if (!platform) return [];

  const messages: InboundMetaMessage[] = [];
  for (const entry of root.entry) {
    const entryObj = asObject(entry);
    if (!entryObj || typeof entryObj.id !== "string" || !Array.isArray(entryObj.messaging)) continue;

    for (const event of entryObj.messaging) {
      const e = asObject(event);
      const message = asObject(e?.message);
      const senderId = asObject(e?.sender)?.id;
      if (!e || !message || typeof senderId !== "string" || typeof message.mid !== "string") continue;
      if (message.is_echo === true || senderId === entryObj.id) continue;

      const hasAttachment = Array.isArray(message.attachments) && message.attachments.length > 0;
      const text = typeof message.text === "string" && message.text.trim() !== "" ? message.text : null;
      if (text === null && !hasAttachment) continue;
      messages.push({ platform, accountId: entryObj.id, senderId, messageId: message.mid, text, hasAttachment });
    }
  }
  return messages;
}
