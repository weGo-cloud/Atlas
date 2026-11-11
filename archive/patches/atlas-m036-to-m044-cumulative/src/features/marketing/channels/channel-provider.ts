import type { ConnectionStatus, MarketingChannel } from "../domain/marketing-channel";

export class ChannelPublishError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONNECTED" | "PROVIDER_ERROR" | "CONFIGURATION_ERROR"
  ) {
    super(message);
    this.name = "ChannelPublishError";
  }
}

/**
 * Mission 031, Section 8/9 — one real interface both MetaChannelProvider
 * and WhatsAppChannelProvider implement. `publish` takes the exact
 * message text to send — already fully assembled (deterministic facts
 * footer included) and possibly dealer-edited by the time it gets
 * here (Section 14) — rather than re-deriving anything from
 * GroundedFacts itself; a provider's only job is "send this text
 * through this channel", not "decide what the message should say".
 * `publish` is only ever called for a `connected` business
 * (PublishService checks status first).
 */
export interface ChannelProvider {
  channel: MarketingChannel;
  /** Whether Atlas itself is configured to support this channel at all in this environment (a platform-level app registration), independent of any one business's connection. */
  isPlatformConfigured(): boolean;
  resolveStatus(businessId: string): Promise<ConnectionStatus>;
  publish(businessId: string, message: string, options?: { recipientPhone?: string }): Promise<{ externalId: string }>;
}
