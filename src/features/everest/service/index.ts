import { getFurnitureProductService } from "@/features/furniture/service";
import { getVehicleService } from "@/features/inventory/service";
import { getEntitlementService } from "@/features/entitlements/service";
import type { Business } from "@/features/auth/domain/business";
import { AutoInventoryAdapter } from "../inventory/auto-adapter";
import { FurnitureInventoryAdapter } from "../inventory/furniture-adapter";
import { createEverestLlmClient } from "../llm/anthropic-llm-client";
import { DatabaseEverestRepository } from "../repository/database-everest-repository";
import { EverestService } from "./everest-service";

/**
 * Wires Everest for one business: the vertical's existing inventory
 * service (through an adapter), the entitlement service, a
 * business-scoped repository, and the model client (null when no
 * ANTHROPIC_API_KEY is set).
 */
export function getEverestService(business: Pick<Business, "id" | "name" | "vertical">): EverestService {
  const adapter =
    business.vertical === "furniture"
      ? new FurnitureInventoryAdapter(getFurnitureProductService(business.id))
      : new AutoInventoryAdapter(getVehicleService(business.id));
  return new EverestService({
    businessId: business.id,
    businessName: business.name,
    repository: new DatabaseEverestRepository(business.id),
    adapter,
    llm: createEverestLlmClient(),
    entitlements: getEntitlementService(),
  });
}
