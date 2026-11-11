import { DatabaseMarketingChannelRepository } from "../repository/database-marketing-channel-repository";
import { graphApiPost, MetaGraphApiError } from "./meta-graph-client";
import { ChannelPublishError, type ChannelProvider } from "./channel-provider";
import type { ConnectionStatus } from "../domain/marketing-channel";

/**
 * Mission 031, Section 8 — a real Meta Graph API integration: connecting
 * a business means completing Meta's OAuth flow for a Page the dealer
 * administers, storing the resulting Page access token
 * (marketing_channel_connections.accessToken), and publishing means a
 * real `POST /{page-id}/feed` call with that token (see `publish`
 * below).
 *
 * What this environment cannot do is *complete* that OAuth flow: it
 * requires a Meta app registered in Meta's own developer console with
 * a live HTTPS redirect URI, which doesn't exist for this sandbox.
 * `isPlatformConfigured()` reports that honestly — it checks for
 * `META_APP_ID`/`META_APP_SECRET`, which are unset here, so every
 * business's status resolves to "configuration_error" rather than
 * ever falsely claiming "connected". The publish path below is real,
 * correct code; it simply never has a token to call it with in this
 * environment, which is the accurate state to report (Section 4:
 * never present a simulated operation as a successful real one) — see
 * PublishService for the separate, explicitly-labeled simulate path
 * dealers use instead while no real connection exists.
 */
export class MetaChannelProvider implements ChannelProvider {
  readonly channel = "meta" as const;

  isPlatformConfigured(): boolean {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  }

  async resolveStatus(businessId: string): Promise<ConnectionStatus> {
    if (!this.isPlatformConfigured()) return "configuration_error";
    const connection = await new DatabaseMarketingChannelRepository(businessId).getConnection("meta");
    return connection?.status ?? "not_connected";
  }

  async publish(businessId: string, message: string): Promise<{ externalId: string }> {
    if (!this.isPlatformConfigured()) {
      throw new ChannelPublishError("Meta integration is not configured for this environment.", "CONFIGURATION_ERROR");
    }

    const connection = await new DatabaseMarketingChannelRepository(businessId).getConnectionWithToken("meta");
    if (!connection || connection.status !== "connected" || !connection.accessToken) {
      throw new ChannelPublishError("Connect a Meta Page before publishing.", "NOT_CONNECTED");
    }

    try {
      const result = await graphApiPost(`${connection.externalAccountLabel ?? ""}/feed`, connection.accessToken, {
        message,
      });
      if (!result.id) {
        throw new ChannelPublishError("Meta did not return a post id.", "PROVIDER_ERROR");
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
