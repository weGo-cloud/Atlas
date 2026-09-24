import { registerMarketingItemAdapter } from "../domain/item-adapter";
import { VehicleMarketingAdapter } from "../adapters/vehicle-marketing-adapter";
import { FurnitureMarketingAdapter } from "../adapters/furniture-marketing-adapter";
import { DatabaseMarketingContentRepository } from "../repository/database-marketing-content-repository";
import {
  DatabaseMarketingChannelRepository,
  DatabaseMarketingPublicationRepository,
} from "../repository/database-marketing-channel-repository";
import { MarketingContentService } from "./marketing-content-service";
import { PublishService } from "./publish-service";
import { MetaChannelProvider } from "../channels/meta-channel-provider";
import { WhatsAppChannelProvider } from "../channels/whatsapp-channel-provider";
import type { ChannelProvider } from "../channels/channel-provider";
import { MARKETING_CHANNELS, type ConnectionStatus, type MarketingChannel } from "../domain/marketing-channel";
import type { MarketableItemRef } from "../domain/marketing-item-ref";
import { getEntitlementService } from "@/features/entitlements/service";

/**
 * Mission 031, Section 12 — registration happens once, here, exactly
 * where conversion/service/conversion-service.ts registers its
 * CATALOG_ADAPTERS. Every other file in features/marketing/ reaches
 * an item through `getMarketingItemAdapter`, never by importing
 * VehicleService/FurnitureProductService directly.
 */
registerMarketingItemAdapter("vehicle", new VehicleMarketingAdapter());
registerMarketingItemAdapter("furniture_product", new FurnitureMarketingAdapter());

const CHANNEL_PROVIDERS: Record<MarketingChannel, ChannelProvider> = {
  meta: new MetaChannelProvider(),
  whatsapp: new WhatsAppChannelProvider(),
};

export function getMarketingContentService(businessId: string): MarketingContentService {
  return new MarketingContentService(new DatabaseMarketingContentRepository(businessId), businessId);
}

export function getPublishService(businessId: string): PublishService {
  return new PublishService(
    businessId,
    new DatabaseMarketingContentRepository(businessId),
    new DatabaseMarketingPublicationRepository(businessId),
    CHANNEL_PROVIDERS
  );
}

export function getMarketingChannelRepository(businessId: string): DatabaseMarketingChannelRepository {
  return new DatabaseMarketingChannelRepository(businessId);
}

export function getChannelProviders(): Record<MarketingChannel, ChannelProvider> {
  return CHANNEL_PROVIDERS;
}

/**
 * Mission 031 — the one place both the Vehicle and Furniture detail
 * pages load everything MarketingPanel needs, so that loading logic
 * exists once rather than being copy-pasted into two route files.
 */
export async function getMarketingPanelData(businessId: string, itemRef: MarketableItemRef) {
  const [content, canUseMarketing, ...statuses] = await Promise.all([
    getMarketingContentService(businessId).getContent(itemRef),
    getEntitlementService()
      .canAccess(businessId, "marketing_automation")
      .then((decision) => decision.allowed),
    ...MARKETING_CHANNELS.map((channel) => CHANNEL_PROVIDERS[channel].resolveStatus(businessId)),
  ]);

  const channelStatuses = Object.fromEntries(MARKETING_CHANNELS.map((channel, i) => [channel, statuses[i]])) as Record<
    MarketingChannel,
    ConnectionStatus
  >;

  const publications = content ? await getPublishService(businessId).listPublications(content.id) : [];

  return { content, publications, channelStatuses, canUseMarketing };
}

export { MarketingContentService, PublishService };
