import { describe, expect, it } from "vitest";

import { parseWhatsAppPayload } from "../payload";

function textWebhook(overrides: Partial<{ phoneNumberId: string; from: string; id: string; body: string; name: string }> = {}) {
  const { phoneNumberId = "1000", from = "254700000001", id = "wamid.A", body = "hello", name = "Test Customer" } = overrides;
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name } }],
              messages: [{ id, from, type: "text", text: { body } }],
            },
          },
        ],
      },
    ],
  };
}

describe("parseWhatsAppPayload", () => {
  it("extracts a text message with sender profile name", () => {
    const messages = parseWhatsAppPayload(textWebhook());
    expect(messages).toEqual([{ phoneNumberId: "1000", from: "254700000001", messageId: "wamid.A", type: "text", text: "hello", profileName: "Test Customer" }]);
  });

  it("ignores status callbacks (no messages array) and non-text types get text: null", () => {
    const statusOnly = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "1000" }, statuses: [{ id: "wamid.S", status: "delivered" }] } }] }] };
    expect(parseWhatsAppPayload(statusOnly)).toEqual([]);

    const image = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "1000" }, messages: [{ id: "wamid.B", from: "254700000002", type: "image", image: { id: "media1" } }] } }] }] };
    expect(parseWhatsAppPayload(image)).toEqual([{ phoneNumberId: "1000", from: "254700000002", messageId: "wamid.B", type: "image", text: null, profileName: null }]);
  });

  it("handles multiple entries/changes/messages in one payload", () => {
    const merged = { entry: [textWebhook({ id: "wamid.1" }).entry[0], textWebhook({ id: "wamid.2", from: "254700000003" }).entry[0]] };
    expect(parseWhatsAppPayload(merged).map((m) => m.messageId)).toEqual(["wamid.1", "wamid.2"]);
  });

  it("never throws on malformed or unexpected shapes", () => {
    expect(parseWhatsAppPayload(null)).toEqual([]);
    expect(parseWhatsAppPayload({})).toEqual([]);
    expect(parseWhatsAppPayload({ entry: "not-an-array" })).toEqual([]);
    expect(parseWhatsAppPayload({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
    expect(parseWhatsAppPayload("just a string")).toEqual([]);
  });
});
