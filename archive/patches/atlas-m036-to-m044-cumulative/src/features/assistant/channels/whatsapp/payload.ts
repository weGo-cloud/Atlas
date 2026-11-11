export type InboundWhatsAppMessage = {
  phoneNumberId: string;
  from: string;
  messageId: string;
  type: string;
  text: string | null;
  profileName: string | null;
};

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

/** Extracts inbound customer messages from a WhatsApp Cloud API webhook body. Status callbacks and malformed entries yield nothing. */
export function parseWhatsAppPayload(body: unknown): InboundWhatsAppMessage[] {
  const root = asObject(body);
  if (!root || !Array.isArray(root.entry)) return [];
  const messages: InboundWhatsAppMessage[] = [];

  for (const entry of root.entry) {
    const entryObj = asObject(entry);
    if (!entryObj || !Array.isArray(entryObj.changes)) continue;
    for (const change of entryObj.changes) {
      const value = asObject(asObject(change)?.value);
      if (!value) continue;
      const phoneNumberId = asObject(value.metadata)?.phone_number_id;
      if (typeof phoneNumberId !== "string" || !Array.isArray(value.messages)) continue;

      const names = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          const c = asObject(contact);
          const name = asObject(c?.profile)?.name;
          if (typeof c?.wa_id === "string" && typeof name === "string") names.set(c.wa_id, name);
        }
      }

      for (const raw of value.messages) {
        const message = asObject(raw);
        if (!message || typeof message.id !== "string" || typeof message.from !== "string" || typeof message.type !== "string") continue;
        const textBody = asObject(message.text)?.body;
        messages.push({
          phoneNumberId,
          from: message.from,
          messageId: message.id,
          type: message.type,
          text: message.type === "text" && typeof textBody === "string" ? textBody : null,
          profileName: names.get(message.from) ?? null,
        });
      }
    }
  }
  return messages;
}
