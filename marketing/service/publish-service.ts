import { getEntitlementService } from "@/features/entitlements/service";
import type { MarketingChannel, MarketingPublication } from "../domain/marketing-channel";
import { fail, ok, type MarketingResult } from "../domain/errors";
import { ChannelPublishError, type ChannelProvider } from "../channels/channel-provider";
import type { MarketingContentRepository } from "../repository/marketing-content-repository";
import type { MarketingPublicationRepository } from "../repository/database-marketing-channel-repository";

/**
 * Mission 031, Section 7/16/17 — ties a channel provider, the M029
 * entitlement system, and publication bookkeeping together. Two
 * separate public methods, deliberately not one method with a
 * `simulate: boolean` flag: `publish` and `simulatePublish` are
 * different enough in meaning (a real external side effect vs. none)
 * that collapsing them into one call with a flag is exactly the kind
 * of ambiguity Section 17 warns about — a caller should never be able
 * to mistake a stray `{ simulate: true }` for an unrelated option and
 * accidentally fire a real publish, or vice versa.
 *
 * Mission 029, Section 22 — gates on the existing `marketing_automation`
 * capability via EntitlementService, exactly like every other
 * capability check in Atlas; no new entitlement mechanism, no
 * `if (plan === ...)`.
 */
export class PublishService {
  constructor(
    private readonly businessId: string,
    private readonly contentRepository: MarketingContentRepository,
    private readonly publicationRepository: MarketingPublicationRepository,
    private readonly providers: Record<MarketingChannel, ChannelProvider>
  ) {}

  /** The real path — only succeeds when the business has a genuinely connected, valid credential for this channel; every attempt (success or failure) is recorded. */
  async publish(
    contentId: string,
    channel: MarketingChannel,
    options?: { recipientPhone?: string }
  ): Promise<MarketingResult<MarketingPublication>> {
    const gate = await this.checkEntitlement();
    if (!gate.ok) return gate;

    const content = await this.contentRepository.getById(contentId);
    if (!content) {
      return fail({ code: "CONTENT_NOT_FOUND", message: "That content was not found." });
    }

    const provider = this.providers[channel];
    const message = channel === "whatsapp" ? content.whatsappMessage : content.socialCaption;

    try {
      const result = await provider.publish(this.businessId, message, options);
      const publication = await this.publicationRepository.create({
        marketingContentId: contentId,
        channel,
        status: "published",
        isSimulated: false,
        externalId: result.externalId,
      });
      return ok(publication);
    } catch (error) {
      if (error instanceof ChannelPublishError) {
        await this.publicationRepository.create({
          marketingContentId: contentId,
          channel,
          status: "failed",
          isSimulated: false,
          errorMessage: error.message,
        });
        return fail({ code: "PUBLISH_FAILED", message: error.message });
      }
      throw error;
    }
  }

  /**
   * Mission 031, Section 17/19 — the demo path. Always available
   * regardless of connection status (that's the point — it exists
   * specifically for when there's no real connection), but still
   * entitlement-gated (Section 22) and always recorded with
   * `isSimulated: true` so it can never be confused with `publish`'s
   * output in the publication history.
   */
  async simulatePublish(contentId: string, channel: MarketingChannel): Promise<MarketingResult<MarketingPublication>> {
    const gate = await this.checkEntitlement();
    if (!gate.ok) return gate;

    const content = await this.contentRepository.getById(contentId);
    if (!content) {
      return fail({ code: "CONTENT_NOT_FOUND", message: "That content was not found." });
    }

    const publication = await this.publicationRepository.create({
      marketingContentId: contentId,
      channel,
      status: "simulated",
      isSimulated: true,
    });
    return ok(publication);
  }

  async listPublications(contentId: string): Promise<MarketingPublication[]> {
    return this.publicationRepository.listForContent(contentId);
  }

  private async checkEntitlement(): Promise<MarketingResult<null>> {
    const decision = await getEntitlementService().canAccess(this.businessId, "marketing_automation");
    if (!decision.allowed) {
      return fail({
        code: "FORBIDDEN",
        message: "Marketing automation isn't available on your current plan.",
      });
    }
    return ok(null);
  }
}
