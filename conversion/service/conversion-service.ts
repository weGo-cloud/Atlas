import type { Business } from "../../auth/domain/business";
import type { BusinessRepository } from "../../auth/repository/business-repository";
import type { Capability } from "../../entitlements/domain/plan";
import type { EntitlementService } from "../../entitlements/service/entitlement-service";
import { getCustomerService } from "../../customers/service";
import { getLeadService } from "../../leads/service";
import type { CatalogAdapter, CatalogItem } from "../domain/catalog-adapter";
import {
  failConversion,
  okConversion,
  type ConversionResult,
  type PublicLeadChannel,
  type PublicLeadInput,
} from "../domain/lead-intake";
import { AutoCatalogAdapter } from "../auto/auto-catalog-adapter";
import { FurnitureCatalogAdapter } from "../furniture/furniture-catalog-adapter";

/**
 * Mission 027 (correction) / Mission 030 — one CatalogAdapter per
 * `businesses.vertical` value. Adding the Furniture vertical was
 * exactly this: one new adapter class and one new entry here —
 * nothing else in this file, the public routes, or the storefront
 * page needed to change.
 */
const CATALOG_ADAPTERS: Record<string, CatalogAdapter> = {
  auto: new AutoCatalogAdapter(),
  furniture: new FurnitureCatalogAdapter(),
};

function adapterFor(business: Pick<Business, "vertical">): CatalogAdapter {
  const adapter = CATALOG_ADAPTERS[business.vertical];
  if (!adapter) {
    // Defensive only — every business is created with vertical="auto"
    // or "furniture" today (see schema.ts's column default and the
    // furniture-vertical seed data), so this is unreachable unless a
    // business row is given some other value directly.
    throw new Error(`No catalog adapter registered for vertical "${business.vertical}".`);
  }
  return adapter;
}

const CHANNEL_CAPABILITY: Record<PublicLeadChannel, Capability> = {
  storefront: "storefront",
  external_integration: "external_integration",
};

/**
 * Mission 027 (correction) / Mission 028 — the WeGO Auto Conversion
 * Layer's single entry point, used by both the Atlas-hosted public
 * storefront and the external-integration API. Neither of those two
 * callers talks to VehicleService, CustomerService, LeadService, or
 * EntitlementService directly — they only ever go through here, so
 * there is exactly one place that (a) enforces the plan entitlement
 * for the channel being used via EntitlementService (Mission 028's
 * central `canAccess`), (b) resolves the right vertical's catalog,
 * and (c) turns a public submission into the same Customer + Lead
 * records staff-created ones become.
 */
export class ConversionService {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly entitlementService: EntitlementService
  ) {}

  /**
   * Resolves a business for a public-facing request and confirms it's
   * entitled to the given channel. Storefront requests additionally
   * require `websiteMode === "atlas_hosted"` (Mission 028's
   * three-state website model — see schema.ts) — a business can be
   * entitled by plan and still have their site set to "own_website"
   * or "none". External-integration requests have no equivalent
   * business-level switch: possessing a live API key already is the
   * on/off switch for that channel.
   */
  async resolveChannel(businessId: string, channel: PublicLeadChannel): Promise<ConversionResult<Business>> {
    const business = await this.businessRepository.getById(businessId);
    if (!business) {
      return failConversion({ code: "BUSINESS_NOT_FOUND", message: "This business does not exist." });
    }

    const decision = await this.entitlementService.canAccess(businessId, CHANNEL_CAPABILITY[channel]);
    if (!decision.allowed) {
      return failConversion({
        code: "FORBIDDEN",
        message: "This business's current plan does not include this feature.",
      });
    }

    if (channel === "storefront" && business.websiteMode !== "atlas_hosted") {
      return failConversion({ code: "STOREFRONT_DISABLED", message: "This business has not enabled its public storefront." });
    }

    return okConversion(business);
  }

  async getPublicCatalog(business: Business): Promise<{ items: CatalogItem[]; itemNounSingular: string; itemNounPlural: string }> {
    const adapter = adapterFor(business);
    const items = await adapter.listAvailable(business.id);
    return { items, itemNounSingular: adapter.itemNounSingular, itemNounPlural: adapter.itemNounPlural };
  }

  async submitPublicLead(
    business: Business,
    channel: PublicLeadChannel,
    input: PublicLeadInput
  ): Promise<ConversionResult<{ leadId: string }>> {
    const fieldErrors: Partial<Record<keyof PublicLeadInput, string>> = {};
    const name = input.name?.trim() ?? "";
    const phone = input.phone?.trim() ?? "";
    if (!name) fieldErrors.name = "Name is required.";
    if (!phone) fieldErrors.phone = "Phone number is required.";
    if (Object.keys(fieldErrors).length > 0) {
      return failConversion({ code: "VALIDATION_ERROR", message: "Please check the form and try again.", fieldErrors });
    }

    const adapter = adapterFor(business);
    let vehicleId: string | null = null;
    let furnitureProductId: string | null = null;
    if (input.catalogItemId) {
      const resolved = await adapter.resolveItemReference(business.id, input.catalogItemId);
      // A stale/invalid catalogItemId (e.g. the item sold between
      // page load and submission) doesn't fail the whole submission —
      // the lead is still real interest in this dealer, it's just no
      // longer tied to one specific item. Silently dropping the
      // reference here, rather than rejecting the lead, is the right
      // tradeoff for a public form a visitor can't easily retry.
      if (resolved && "vehicleId" in resolved) vehicleId = resolved.vehicleId;
      if (resolved && "furnitureProductId" in resolved) furnitureProductId = resolved.furnitureProductId;
    }

    const customerService = getCustomerService(business.id);
    const customerResult = await customerService.createCustomer({
      name,
      phone,
      email: input.email?.trim() || null,
      notes: input.message?.trim() ? `Public inquiry: ${input.message.trim()}` : undefined,
    });
    if (!customerResult.ok) {
      return failConversion({ code: "VALIDATION_ERROR", message: customerResult.error.message });
    }

    const leadService = getLeadService(business.id);
    const leadResult = await leadService.createLead({
      customerId: customerResult.data.id,
      vehicleId,
      furnitureProductId,
      source: channel === "storefront" ? "storefront" : "external_integration",
    });
    if (!leadResult.ok) {
      return failConversion({ code: "VALIDATION_ERROR", message: leadResult.error.message });
    }

    return okConversion({ leadId: leadResult.data.id });
  }
}
