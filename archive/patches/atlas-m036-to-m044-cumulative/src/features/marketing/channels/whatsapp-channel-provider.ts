import { DatabaseMarketingChannelRepository } from "../repository/database-marketing-channel-repository";
import { graphApiJsonPost, MetaGraphApiError } from "./meta-graph-client";
import { ChannelPublishError, type ChannelProvider } from "./channel-provider";
import type { ConnectionStatus } from "../domain/marketing-channel";

/**
 * Mission 031, Section 9 — "do not build an unofficial WhatsApp
 * automation mechanism that violates provider/platform rules." This
 * uses the official WhatsApp Business Cloud API (also a Meta Graph
 * API product — see meta-graph-client.ts's shared HTTP helper), never
 * a headless-browser or unofficial-client approach. Sending requires
 * a specific recipient phone number and, for the first message in a
 * 24-hour window, an approved message template — this method takes a
 * `recipientPhone` for exactly that reason (Section 9: "dealer
 * chooses recipient"), rather than broadcasting.
 *
 * Same environment limitation as MetaChannelProvider: no
 * WHATSAPP_PHONE_NUMBER_ID/META_APP credentials exist here, so
 * `isPlatformConfigured()` is honestly false and every business
 * resolves to "configuration_error". See that provider's doc comment
 * for the full rationale — it applies identically here.
 */
export class WhatsAppChannelProvider implements ChannelProvider {
  readonly channel = "whatsapp" as const;

  isPlatformConfigured(): boolean {
    return Boolean(process.env.META_APP_ID && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async resolveStatus(businessId: string): Promise<ConnectionStatus> {
    if (!this.isPlatformConfigured()) return "configuration_error";
    const connection = await new DatabaseMarketingChannelRepository(businessId).getConnection("whatsapp");
    return connection?.status ?? "not_connected";
  }

  /** `options.recipientPhone` — Section 9: the dealer picks who receives this, Atlas never sends unsolicited outbound messages on its own. */
  async publish(businessId: string, message: string, options?: { recipientPhone?: string }): Promise<{ externalId: string }> {
    if (!this.isPlatformConfigured()) {
      throw new ChannelPublishError("WhatsApp integration is not configured for this environment.", "CONFIGURATION_ERROR");
    }
    if (!options?.recipientPhone) {
      throw new ChannelPublishError("A recipient phone number is required to send a WhatsApp message.", "PROVIDER_ERROR");
    }

    const connection = await new DatabaseMarketingChannelRepository(businessId).getConnectionWithToken("whatsapp");
    if (!connection || connection.status !== "connected" || !connection.accessToken) {
      throw new ChannelPublishError("Connect WhatsApp Business before sending.", "NOT_CONNECTED");
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;

    try {
      const result = await graphApiJsonPost(`${phoneNumberId}/messages`, connection.accessToken, {
        messaging_product: "whatsapp",
        to: options.recipientPhone,
        type: "text",
        text: { body: message },
      });
      if (!result.id) {
        throw new ChannelPublishError("WhatsApp did not return a message id.", "PROVIDER_ERROR");
      }
      return { externalId: result.id };
    } catch (error) {
      if (error instanceof MetaGraphApiError) {
        throw new ChannelPublishError(error.message, "PROVIDER_ERROR");
      }
      throw error;
    }
  }
}
