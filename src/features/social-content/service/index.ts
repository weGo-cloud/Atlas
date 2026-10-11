import { getEntitlementService } from "@/features/entitlements/service";
import { registerItemPhotosPort } from "../domain/item-photos-port";
import { registerPhotoPathResolver } from "../domain/photo-path-resolver";
import { VehicleItemPhotosPort } from "../adapters/vehicle-item-photos-port";
import { FurnitureItemPhotosPort } from "../adapters/furniture-item-photos-port";
import { VehiclePhotoPathResolver } from "../adapters/vehicle-photo-path-resolver";
import { FurniturePhotoPathResolver } from "../adapters/furniture-photo-path-resolver";
import { DatabaseSocialPostRepository } from "../repository/database-social-post-repository";
import { SocialContentService } from "./social-content-service";

/**
 * Mission 034 — registration happens once, here, exactly where
 * marketing/service/index.ts registers its own per-vertical adapters.
 */
registerItemPhotosPort("vehicle", new VehicleItemPhotosPort());
registerItemPhotosPort("furniture_product", new FurnitureItemPhotosPort());
registerPhotoPathResolver("vehicle", new VehiclePhotoPathResolver());
registerPhotoPathResolver("furniture_product", new FurniturePhotoPathResolver());

export function getSocialContentService(businessId: string): SocialContentService {
  return new SocialContentService(new DatabaseSocialPostRepository(businessId), businessId);
}

/** Same capability the existing MarketingPanel gates on ("marketing_automation") — image posts are part of the same marketing entitlement, not a new one. */
export async function canUseSocialContent(businessId: string): Promise<boolean> {
  const decision = await getEntitlementService().canAccess(businessId, "marketing_automation");
  return decision.allowed;
}

export { SocialContentService };
